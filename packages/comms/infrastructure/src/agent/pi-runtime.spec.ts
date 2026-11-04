import { describe, expect, it } from '@effect/vitest';
import {
  AgentRuntimeError,
  type RuntimeTool,
  type RuntimeEvent,
  type ToolOutcome,
  type TurnInput,
} from '@pocket-comms/comms-application';
import { createModels } from '@earendil-works/pi-ai';
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Stream from 'effect/Stream';
import { makePiRuntime, scrubSecrets } from './pi-runtime.js';

/** A tool that records its inputs and answers with `outcome`. */
const tool = (name: string, outcome: ToolOutcome, calls: Array<unknown> = []): RuntimeTool => ({
  name,
  description: `The ${name} tool.`,
  parameters: { type: 'object', properties: { n: { type: 'number' } } },
  run: (input) =>
    Effect.sync(() => {
      calls.push(input);
      return outcome;
    }),
});

const answer = (output: string, pause = false): ToolOutcome => ({ output, isError: false, pause });

const setup = () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const runtime = makePiRuntime({ models, model: faux.getModel() });
  return { faux, runtime };
};

const turn = (
  tools: ReadonlyArray<RuntimeTool>,
  input = 'Hello',
  state: TurnInput['state'] = Option.none(),
) => ({
  sessionId: '00000000-0000-4000-8000-0000000000aa',
  instructions: 'Teach Tulu with the two principles.',
  state,
  input,
  images: [],
  tools,
});

const run = (runtime: ReturnType<typeof setup>['runtime'], input: TurnInput) =>
  Stream.runCollect(runtime.runTurn(input));

const kinds = (events: ReadonlyArray<RuntimeEvent>) =>
  [...new Set(events.map((event) => event._tag))].filter((kind) => kind !== 'textDelta');

describe('the Pi runtime', () => {
  it.effect('streams Pi’s text and ends with a state to continue from', () =>
    Effect.gen(function* () {
      const { faux, runtime } = setup();
      faux.setResponses([fauxAssistantMessage('Namaskara! Shall we start?')]);
      const events = yield* run(runtime, turn([]));
      expect(events.some((event) => event._tag === 'textDelta')).toBe(true);
      expect(events.filter((event) => event._tag === 'message')).toEqual([
        { _tag: 'message', text: 'Namaskara! Shall we start?' },
      ]);
      const ended = events.at(-1);
      expect(ended?._tag === 'ended' && ended.state.adapter).toBe('pi');
    }),
  );

  it.effect('offers the model exactly the given tools, with the instructions as the prompt', () =>
    Effect.gen(function* () {
      const { faux, runtime } = setup();
      let offered: Array<string> = [];
      let prompt = '';
      faux.setResponses([
        (context) => {
          for (const message of context.messages) {
            if (message.role !== 'system') continue;
            prompt ||= typeof message.content === 'string' ? message.content : '';
            offered = [...offered, ...(message.toolsAdded ?? []).map((t) => t.name)];
          }
          return fauxAssistantMessage('ok');
        },
      ]);
      yield* run(
        runtime,
        turn([tool('read_subject', answer('{}')), tool('quiz', answer('shown', true))]),
      );
      expect(offered.sort()).toEqual(['quiz', 'read_subject']);
      expect(prompt).toContain('two principles');
    }),
  );

  it.effect('runs a tool the model calls and reports the call and its result', () =>
    Effect.gen(function* () {
      const { faux, runtime } = setup();
      const calls: Array<unknown> = [];
      faux.setResponses([
        fauxAssistantMessage([fauxToolCall('list_cards', { n: 1 }, { id: 'call-1' })], {
          stopReason: 'toolUse',
        }),
        fauxAssistantMessage([fauxText('You have one card.')]),
      ]);
      const events = yield* run(
        runtime,
        turn([tool('list_cards', answer('[{"id":"tu-nir"}]'), calls)]),
      );
      expect(calls).toEqual([{ n: 1 }]);
      expect(kinds(events)).toEqual(['toolCall', 'toolResult', 'message', 'ended']);
      expect(events.find((event) => event._tag === 'toolCall')).toEqual({
        _tag: 'toolCall',
        callId: 'call-1',
        tool: 'list_cards',
        input: { n: 1 },
      });
      expect(events.find((event) => event._tag === 'toolResult')).toMatchObject({
        callId: 'call-1',
        output: '[{"id":"tu-nir"}]',
        isError: false,
      });
    }),
  );

  it.effect('ends the turn after a pausing tool, without asking the model again', () =>
    Effect.gen(function* () {
      const { faux, runtime } = setup();
      faux.setResponses([
        fauxAssistantMessage([fauxToolCall('quiz', { n: 1 })], { stopReason: 'toolUse' }),
        fauxAssistantMessage('This must never be said.'),
      ]);
      const events = yield* run(runtime, turn([tool('quiz', answer('Shown as entry 3.', true))]));
      expect(faux.state.callCount).toBe(1);
      expect(events.some((event) => event._tag === 'message')).toBe(false);
      expect(events.at(-1)?._tag).toBe('ended');
    }),
  );

  it.effect('reports a tool error to the model as an error result', () =>
    Effect.gen(function* () {
      const { faux, runtime } = setup();
      faux.setResponses([
        fauxAssistantMessage([fauxToolCall('quiz', { n: 1 })], { stopReason: 'toolUse' }),
        fauxAssistantMessage('Let me fix that quiz.'),
      ]);
      const events = yield* run(
        runtime,
        turn([tool('quiz', { output: 'A quiz needs two options', isError: true, pause: false })]),
      );
      expect(events.find((event) => event._tag === 'toolResult')).toMatchObject({ isError: true });
    }),
  );

  it.effect('continues the next turn from the stored state', () =>
    Effect.gen(function* () {
      const { faux, runtime } = setup();
      let seen: Array<string> = [];
      faux.setResponses([
        fauxAssistantMessage('Tea is chA.'),
        (context) => {
          seen = context.messages.flatMap((message) => {
            if (message.role !== 'user') return [];
            return typeof message.content === 'string'
              ? [message.content]
              : message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []));
          });
          return fauxAssistantMessage('And water is nIr.');
        },
      ]);
      const first = yield* run(runtime, turn([], 'Tea?'));
      const ended = first.at(-1);
      if (ended?._tag !== 'ended') throw new Error('expected an end');
      yield* run(runtime, turn([], 'Water?', Option.some(ended.state)));
      expect(seen).toEqual(['Tea?', 'Water?']);
    }),
  );

  it.effect('reports a tool that dies to the model as an error result, as Pi does', () =>
    Effect.gen(function* () {
      const { faux, runtime } = setup();
      faux.setResponses([
        fauxAssistantMessage([fauxToolCall('broken', { n: 1 })], { stopReason: 'toolUse' }),
        fauxAssistantMessage('That did not work.'),
      ]);
      const broken: RuntimeTool = { ...tool('broken', answer('')), run: () => Effect.die('boom') };
      const events = yield* run(runtime, turn([broken]));
      expect(events.find((event) => event._tag === 'toolResult')).toMatchObject({ isError: true });
      expect(events.at(-1)?._tag).toBe('ended');
    }),
  );

  it.effect('fails the turn when the stored history cannot be read', () =>
    Effect.gen(function* () {
      const { runtime } = setup();
      const error = yield* run(
        runtime,
        turn([], 'Hi', Option.some({ adapter: 'pi', state: { messages: 'garbage' } })),
      ).pipe(Effect.flip);
      expect(error.reason).toContain('history');
    }),
  );

  it.effect('fails the turn when the model fails', () =>
    Effect.gen(function* () {
      const { faux, runtime } = setup();
      faux.setResponses([
        fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'The model is overloaded' }),
      ]);
      const error = yield* run(runtime, turn([])).pipe(Effect.flip);
      expect(error).toBeInstanceOf(AgentRuntimeError);
      expect(error.reason).toContain('overloaded');
    }),
  );
});

describe('scrubSecrets', () => {
  it.effect(
    'gives a model that takes pictures the turn’s images with the text, and keeps them',
    () =>
      Effect.gen(function* () {
        const { faux, runtime } = setup();
        const seen: Array<unknown> = [];
        faux.setResponses([
          (context) => {
            seen.push(context.messages.at(-1));
            return fauxAssistantMessage('A blue door.');
          },
        ]);
        const events = yield* run(runtime, {
          ...turn([], 'What is this? [Picture 1 attached]'),
          images: [{ kind: 'png', bytes: new Uint8Array([1, 2, 3]) }],
        });
        expect(runtime.seesImages).toBe(true);
        expect(seen).toEqual([
          expect.objectContaining({
            role: 'user',
            content: [
              { type: 'text', text: 'What is this? [Picture 1 attached]' },
              { type: 'image', data: 'AQID', mimeType: 'image/png' },
            ],
          }),
        ]);
        const ended = events.at(-1);
        expect(JSON.stringify(ended?._tag === 'ended' && ended.state)).toContain('"data":"AQID"');
      }),
  );

  it('says whether the model takes pictures', () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    const textOnly = makePiRuntime({ models, model: { ...faux.getModel(), input: ['text'] } });
    expect(textOnly.seesImages).toBe(false);
  });

  it('removes the API key and anything that looks like a provider key from a reason', () => {
    expect(scrubSecrets('Bad key my-own-secret-value given', 'my-own-secret-value')).toBe(
      'Bad key [redacted] given',
    );
    expect(scrubSecrets('Incorrect API key provided: sk-proj-abcdEFGH1234.', undefined)).toBe(
      'Incorrect API key provided: [redacted].',
    );
    expect(scrubSecrets('The model is overloaded.', undefined)).toBe('The model is overloaded.');
  });
});
