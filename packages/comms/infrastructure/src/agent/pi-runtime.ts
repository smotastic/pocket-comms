import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type ThinkingLevel,
} from '@earendil-works/pi-agent-core';
import type { Api, Model, Models } from '@earendil-works/pi-ai';
import {
  AgentRuntimeError,
  AgentRuntimeOutbound,
  type RuntimeTool,
  type RuntimeEvent,
  type TurnInput,
} from '@pocket-comms/comms-application';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as Queue from 'effect/Queue';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import { Type } from 'typebox';

// The first adapter of the agent runtime port (ADR 0012): Pi's agent core, in process. It offers
// the model only the tools of the turn; Pi's own file, shell and edit tools live in
// `pi-coding-agent`, which this service does not use.

const ADAPTER = 'pi';

/** How requests name this app to the model provider. */
export const ATTRIBUTION = {
  name: 'pocket-comms',
  url: 'https://github.com/smotastic/pocket-comms',
};

/** What the adapter needs: the model catalog, the model, and its credentials. */
export interface PiSetup {
  readonly models: Models;
  readonly model: Model<Api>;
  readonly apiKey?: Redacted.Redacted<string> | undefined;
  readonly thinking?: ThinkingLevel | undefined;
}

/** The runtime state of a session: Pi's messages, stored as JSON. */
const PiState = Schema.Struct({ messages: Schema.Array(Schema.Json) });

const textOf = (output: Schema.Json) =>
  typeof output === 'string' ? output : JSON.stringify(output);

/** A runtime tool in Pi's shape; its outcome decides whether the turn pauses. */
const piTool =
  (run: <A>(effect: Effect.Effect<A>, options?: { readonly signal?: AbortSignal }) => Promise<A>) =>
  (tool: RuntimeTool): AgentTool => ({
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: Type.Unsafe(tool.parameters),
    // A waiting tool pauses the turn; one at a time keeps that decision simple.
    executionMode: 'sequential',
    // Pi's signal interrupts the tool's effect when the turn is aborted.
    execute: async (_callId, params, signal) => {
      const outcome = await run(tool.run(params), signal === undefined ? undefined : { signal });
      return {
        content: [{ type: 'text', text: textOf(outcome.output) }],
        details: outcome.output,
        isError: outcome.isError,
        terminate: outcome.pause,
      };
    },
  });

/** The text of an assistant message. */
const assistantText = (message: AgentMessage) =>
  message.role === 'assistant'
    ? message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
    : '';

const asJson = Schema.decodeUnknownOption(Schema.Json);

/** Turns Pi's events into the port's events. */
const toRuntimeEvent = (event: AgentEvent): ReadonlyArray<RuntimeEvent> => {
  switch (event.type) {
    case 'message_update':
      return event.assistantMessageEvent.type === 'text_delta'
        ? [{ _tag: 'textDelta', text: event.assistantMessageEvent.delta }]
        : [];
    case 'message_end': {
      const text = assistantText(event.message);
      return text === '' ? [] : [{ _tag: 'message', text }];
    }
    case 'tool_execution_start':
      return [
        {
          _tag: 'toolCall',
          callId: event.toolCallId,
          tool: event.toolName,
          input: Option.getOrElse(asJson(event.args), () => null),
        },
      ];
    case 'tool_execution_end':
      return [
        {
          _tag: 'toolResult',
          callId: event.toolCallId,
          tool: event.toolName,
          output: Option.getOrElse(asJson(event.result?.details), () => null),
          isError: event.isError,
        },
      ];
    default:
      return [];
  }
};

// What looks like a provider key, such as `sk-proj-…`; providers echo part of one in a 401.
const KEY_LIKE = /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/gu;

/**
 * A failure reason without the API key or anything that looks like one: the reason is shown in
 * the browser (spec 013, requirement 21).
 */
export const scrubSecrets = (reason: string, apiKey: string | undefined): string => {
  const withoutKey =
    apiKey === undefined || apiKey === '' ? reason : reason.replaceAll(apiKey, '[redacted]');
  return withoutKey.replace(KEY_LIKE, '[redacted]');
};

/** Why the last answer of the model failed, if it did. */
const failureOf = (agent: Agent): Option.Option<string> => {
  const last = agent.state.messages.at(-1);
  if (last?.role === 'assistant' && (last.stopReason === 'error' || last.stopReason === 'aborted'))
    return Option.some(last.errorMessage ?? `The model stopped: ${last.stopReason}`);
  return Option.fromUndefinedOr(agent.state.errorMessage);
};

const isAgentMessage = (value: Schema.Json): value is AgentMessage & Schema.Json =>
  Predicate.isObject(value) && Predicate.hasProperty(value, 'role');

/**
 * The session's history. A state of another runtime starts afresh; a Pi state that does not read
 * fails the turn rather than losing the history without a word.
 */
const restore = (turn: TurnInput): Effect.Effect<Array<AgentMessage>, AgentRuntimeError> =>
  Option.match(turn.state, {
    onNone: () => Effect.succeed([]),
    onSome: (state) =>
      state.adapter === ADAPTER
        ? Schema.decodeUnknownEffect(PiState)(state.state).pipe(
            // Pi's messages are its own format; the service stores them without reading them.
            Effect.map((stored) => stored.messages.filter(isAgentMessage)),
            Effect.mapError(
              () =>
                new AgentRuntimeError({
                  reason: 'The stored history of this session cannot be read.',
                }),
            ),
          )
        : Effect.succeed([]),
  });

/** The agent runtime on Pi (ADR 0012). */
export const makePiRuntime = (setup: PiSetup) => {
  const scrub = (reason: string) =>
    scrubSecrets(reason, setup.apiKey === undefined ? undefined : Redacted.value(setup.apiKey));
  return AgentRuntimeOutbound.of({
    notSetUp: Option.none(),
    runTurn: (turn) =>
      Stream.callback<RuntimeEvent, AgentRuntimeError>((queue) =>
        Effect.gen(function* () {
          const context = yield* Effect.context<never>();
          const run = Effect.runPromiseWith(context);
          const agent = new Agent({
            initialState: {
              systemPrompt: turn.instructions,
              model: setup.model,
              thinkingLevel: setup.thinking ?? 'off',
              tools: turn.tools.map(piTool(run)),
              messages: yield* restore(turn),
            },
            streamFn: setup.models.streamSimple.bind(setup.models),
            sessionId: turn.sessionId,
            identity: { attribution: ATTRIBUTION },
            getApiKey: async () =>
              setup.apiKey === undefined ? undefined : Redacted.value(setup.apiKey),
          });
          agent.subscribe((event) => {
            for (const runtimeEvent of toRuntimeEvent(event))
              Queue.offerUnsafe(queue, runtimeEvent);
          });
          yield* Effect.addFinalizer(() => Effect.sync(() => agent.abort()));
          yield* Effect.tryPromise({
            try: () => agent.prompt(turn.input),
            catch: (error) => new AgentRuntimeError({ reason: scrub(String(error)) }),
          });
          const failure = failureOf(agent);
          if (Option.isSome(failure))
            return yield* new AgentRuntimeError({ reason: scrub(failure.value) });
          // Through JSON text, so fields Pi leaves undefined are dropped as JSON drops them.
          const messages = agent.state.messages.flatMap((message) =>
            Option.toArray(asJson(JSON.parse(JSON.stringify(message)))),
          );
          Queue.offerUnsafe(queue, {
            _tag: 'ended',
            state: { adapter: ADAPTER, state: { messages } },
          });
          Queue.endUnsafe(queue);
        }).pipe(
          // A defect fails the stream too, so its consumer never waits for an end that won't come.
          Effect.catchCause((cause) =>
            Queue.fail(
              queue,
              Option.getOrElse(
                Cause.findErrorOption(cause),
                () => new AgentRuntimeError({ reason: 'The agent runtime failed unexpectedly.' }),
              ),
            ),
          ),
        ),
      ),
  });
};
