import { Problems, ValidationMiddleware } from '@pocket-comms/contracts-problem-details';
import * as Schema from 'effect/Schema';
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  OpenApi,
} from 'effect/http-api';

// Wire schemas of the comms API v1. Every field carries a description and an example, because
// the published documents are linted for both.

export const AgentParam = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9:._-]{1,100}$/u),
).annotate({
  description: "The agent's Herdr name, or its pane id when it has none.",
  examples: ['kirk-ingestor-mvp'],
});

// An optional member: the annotations sit on the member itself, where the document lint looks.
const optional = <S extends Schema.Top>(
  schema: S,
  annotations: { readonly description: string; readonly examples: ReadonlyArray<S['Type']> },
) => Schema.optionalKey(Schema.UndefinedOr(schema).annotate(annotations));

const Millis = Schema.Int.annotate({
  description: 'A moment in epoch milliseconds.',
  examples: [1793391381245],
});

export const AgentStatus = Schema.Literals([
  'working',
  'blocked',
  'done',
  'idle',
  'unknown',
]).annotate({
  description: 'What the agent is doing, as Herdr reports it. `blocked` waits for an answer.',
  examples: ['working'],
});

export const Agent = Schema.Struct({
  ref: AgentParam,
  paneId: Schema.String.annotate({ description: "The agent's Herdr pane.", examples: ['wJ:p1'] }),
  name: optional(Schema.String, { description: "The agent's Herdr name.", examples: ['kirk'] }),
  kind: optional(Schema.String, {
    description: 'The agent program Herdr detected.',
    examples: ['claude'],
  }),
  format: optional(Schema.Literals(['claude', 'pi']), {
    description: 'The session format the app shows as a chat; missing for a screen-only agent.',
    examples: ['claude'],
  }),
  status: AgentStatus,
  title: Schema.String.annotate({
    description: 'The terminal title, without the status glyph.',
    examples: ['Pocket-home ingestor MVP discussion'],
  }),
  cwd: optional(Schema.String, {
    description: "The agent's working directory.",
    examples: ['/Users/me/.herdr/worktrees/pocket-home/feat-ingestor-mvp'],
  }),
  workspace: Schema.String.annotate({
    description: "The label of the agent's Herdr workspace.",
    examples: ['ingestor-mvp'],
  }),
  changedAt: Millis.annotate({
    description: 'When the agent last changed, in epoch milliseconds.',
  }),
  needsYou: Schema.Boolean.annotate({
    description: 'Blocked, or done with a completion the owner has not seen yet.',
    examples: [false],
  }),
}).annotate({ identifier: 'Agent', description: 'A live agent.' });

const Agents = Schema.Array(Agent).annotate({
  description: 'Agents in Herdr order.',
  examples: [[]],
});

export const Overview = Schema.Struct({
  needsYou: Agents.annotate({ description: 'Blocked agents, then unseen done agents.' }),
  groups: Schema.Array(
    Schema.Struct({
      key: Schema.String.annotate({
        description: "The repository's key, or `ws:<workspace>` for a workspace alone.",
        examples: ['/Users/me/projects/pocket-home/.git'],
      }),
      name: Schema.String.annotate({
        description: 'The repository or workspace name.',
        examples: ['pocket-home'],
      }),
      agents: Agents,
    }).annotate({ identifier: 'OverviewGroup', description: 'The agents of one repository.' }),
  ).annotate({
    description: 'Every other agent by repository, in workspace order.',
    examples: [[]],
  }),
}).annotate({ identifier: 'Overview', description: 'Every live agent, sorted for the owner.' });

export const OverviewState = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag('Available').annotate({
      description: 'Herdr answers.',
      examples: ['Available'],
    }),
    overview: Overview,
  }),
  Schema.Struct({
    _tag: Schema.tag('Unavailable').annotate({
      description: 'Herdr cannot be reached.',
      examples: ['Unavailable'],
    }),
    reason: Schema.String.annotate({
      description: 'Why Herdr cannot be reached.',
      examples: ['connect ENOENT /Users/me/.config/herdr/herdr.sock'],
    }),
  }),
]).annotate({
  identifier: 'OverviewState',
  description: 'The overview, or why Herdr cannot be reached.',
});

const id = Schema.String.annotate({ description: 'The id of the entry.', examples: ['u-1'] });
const at = Millis.annotate({ description: 'When the entry was written, in epoch milliseconds.' });

export const TranscriptEntry = Schema.Union([
  Schema.Struct({
    type: Schema.tag('user').annotate({ description: "The owner's prompt.", examples: ['user'] }),
    id,
    at,
    text: Schema.String.annotate({
      description: "The owner's prompt.",
      examples: ['Run the tests'],
    }),
  }),
  Schema.Struct({
    type: Schema.tag('assistant').annotate({
      description: 'A reply of the agent.',
      examples: ['assistant'],
    }),
    id,
    at,
    text: Schema.String.annotate({ description: 'The reply as Markdown.', examples: ['Done.'] }),
  }),
  Schema.Struct({
    type: Schema.tag('tool').annotate({ description: 'One tool call.', examples: ['tool'] }),
    id,
    at,
    verb: Schema.Literals([
      'Ran',
      'Edited',
      'Wrote',
      'Read',
      'Searched',
      'Fetched',
      'Delegated',
      'Used',
    ]).annotate({ description: 'What the tool call did.', examples: ['Ran'] }),
    target: optional(Schema.String, {
      description: 'The file, command or name it worked on.',
      examples: ['pnpm test'],
    }),
    added: optional(Schema.Int, { description: 'Lines an edit added.', examples: [12] }),
    removed: optional(Schema.Int, { description: 'Lines an edit removed.', examples: [3] }),
    outcome: Schema.Literals(['ok', 'error', 'pending']).annotate({
      description: 'How the call ended; `pending` while it runs.',
      examples: ['ok'],
    }),
  }),
]).annotate({ identifier: 'TranscriptEntry', description: 'One entry of the chat.' });

const Entries = Schema.Array(TranscriptEntry).annotate({
  description: 'Entries, oldest first.',
  examples: [[]],
});
const Activity = Schema.String.annotate({
  description: 'What a working agent does now.',
  examples: ['Running pnpm test…'],
});

export const Transcript = Schema.Struct({ entries: Entries, activity: Activity }).annotate({
  identifier: 'Transcript',
  description: 'The latest entries of the agent’s session.',
});

export const AgentEvent = Schema.Union([
  Schema.Struct({
    type: Schema.tag('agent').annotate({ description: 'The agent changed.', examples: ['agent'] }),
    agent: Agent,
  }),
  Schema.Struct({
    type: Schema.tag('entries').annotate({
      description: 'Entries arrived or changed.',
      examples: ['entries'],
    }),
    reset: Schema.Boolean.annotate({
      description: 'The entries replace the ones the reader holds: the first event of a session.',
      examples: [true],
    }),
    entries: Entries,
    activity: Activity,
  }),
]).annotate({ identifier: 'AgentEvent', description: 'One update of an open conversation.' });

export const Screen = Schema.Struct({
  text: Schema.String.annotate({
    description: "The pane's visible screen with its ANSI escape sequences.",
    examples: ['\u001b[1mAllow command?\u001b[0m'],
  }),
}).annotate({ identifier: 'Screen', description: "The agent's terminal screen." });

/** The keys the app sends; the service accepts no other. */
export const KEYS = ['1', '2', '3', 'up', 'down', 'enter', 'esc', 'ctrl+c'] as const;

export const PromptRequest = Schema.Struct({
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(20_000)).annotate({
    description: 'The prompt; it is sent trimmed and must not be blank.',
    examples: ['Run the tests and fix what fails.'],
  }),
}).annotate({ identifier: 'PromptRequest', description: 'A prompt for the agent.' });

export const KeysRequest = Schema.Struct({
  keys: Schema.Array(
    Schema.Literals(KEYS).annotate({ description: 'One key.', examples: ['enter'] }),
  )
    .check(Schema.isMinLength(1), Schema.isMaxLength(8))
    .annotate({ description: 'One to eight keys, pressed in order.', examples: [['1']] }),
}).annotate({ identifier: 'KeysRequest', description: 'Key presses for the agent.' });

/**
 * The Tailscale identity check: `tailscale serve` adds `Tailscale-User-Login`, and only the
 * allowed login may use the service. The server checks every route, also outside this API.
 */
export class TailscaleIdentity extends HttpApiMiddleware.Service<TailscaleIdentity>()(
  'comms/contract/TailscaleIdentity',
  { error: Problems.Forbidden },
) {}

/**
 * A server-sent event stream whose events are all named `name` and carry `data` as JSON. The
 * stream items are `{ event, data }`.
 */
const eventStream = <S extends Schema.Top>(name: string, data: S, example: string) =>
  HttpApiSchema.StreamSse({
    events: Schema.Struct({
      event: Schema.Literal(name).annotate({ description: 'The event name.', examples: [name] }),
      data: Schema.fromJsonString(data).pipe(
        Schema.annotateEncoded({ description: 'The event as JSON.', examples: [example] }),
      ),
    }),
  });

const agent = { agent: AgentParam };
const problems = [Problems.NotFound, Problems.ServiceUnavailable];

const group = HttpApiGroup.make('agents')
  .add(
    HttpApiEndpoint.get('overview', '/agents', {
      success: Overview,
      error: Problems.ServiceUnavailable,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'List the agents',
        description: 'Every live agent: Needs you first, then the rest by repository.',
      }),
    ),
    HttpApiEndpoint.get('overviewEvents', '/events', {
      success: eventStream(
        'overview',
        OverviewState,
        '{"_tag":"Unavailable","reason":"Herdr is not running."}',
      ),
      error: Problems.ServiceUnavailable,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Follow the overview',
        description:
          'Server-sent events: the overview at once and after every change, or why Herdr cannot be reached.',
      }),
    ),
    HttpApiEndpoint.get('agent', '/agents/:agent', {
      params: agent,
      success: Agent,
      error: problems,
    }).annotateMerge(
      OpenApi.annotations({ summary: 'Get an agent', description: 'Returns one live agent.' }),
    ),
    HttpApiEndpoint.get('transcript', '/agents/:agent/transcript', {
      params: agent,
      success: Transcript,
      error: problems,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Read the conversation',
        description:
          "The latest entries of a Claude or Pi agent's session. Other agents have none (404).",
      }),
    ),
    HttpApiEndpoint.get('agentEvents', '/agents/:agent/events', {
      params: agent,
      success: eventStream(
        'agent',
        AgentEvent,
        '{"type":"entries","reset":true,"entries":[],"activity":"Thinking…"}',
      ),
      error: problems,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Follow a conversation',
        description:
          'Server-sent events: the agent after each change, and its session entries, starting with a reset.',
      }),
    ),
    HttpApiEndpoint.get('screen', '/agents/:agent/screen', {
      params: agent,
      success: Screen,
      error: [...problems, Problems.Conflict],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Read the screen',
        description: "The agent pane's visible screen, with colours. It never moves the focus.",
      }),
    ),
    HttpApiEndpoint.post('prompt', '/agents/:agent/prompt', {
      params: agent,
      payload: PromptRequest,
      success: HttpApiSchema.NoContent,
      error: [...problems, Problems.Conflict, Problems.Validation],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Send a prompt',
        description: 'Types the prompt into the agent and submits it, without waiting for a reply.',
      }),
    ),
    HttpApiEndpoint.post('keys', '/agents/:agent/keys', {
      params: agent,
      payload: KeysRequest,
      success: HttpApiSchema.NoContent,
      error: [...problems, Problems.Conflict, Problems.Validation],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Press keys',
        description: 'Presses the keys in the agent, such as an approval choice.',
      }),
    ),
    HttpApiEndpoint.post('seen', '/agents/:agent/seen', {
      params: agent,
      success: HttpApiSchema.NoContent,
      error: problems,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Mark as seen',
        description: 'Remembers that the owner saw the current completion of a done agent.',
      }),
    ),
  )
  .middleware(TailscaleIdentity)
  .middleware(ValidationMiddleware)
  .prefix('/api/v1')
  .annotateMerge(
    OpenApi.annotations({
      title: 'Agents',
      description: 'Read and drive the Herdr agents.',
    }),
  );

/** The comms API v1, shared by the server and the web app. */
export const CommsApi = HttpApi.make('comms')
  .add(group)
  .annotate(HttpApi.ParseOptions, { errors: 'all' })
  // A body field the contract does not declare fails instead of being dropped. A slot annotation
  // replaces `ParseOptions`, so it repeats `errors`.
  .annotate(HttpApi.PayloadParseOptions, { errors: 'all', onExcessProperty: 'error' })
  .annotateMerge(
    OpenApi.annotations({
      title: 'pocket-comms API',
      version: '1',
      description: "Read and drive the owner's Herdr coding agents from the phone.",
      transform: (spec) => liftParameterDocs(spec),
    }),
  );

export type CommsApi = typeof CommsApi;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Effect writes a parameter's description and examples into its schema only; OpenAPI tools show
 * the ones on the parameter itself, so the document carries them there as well.
 */
export const liftParameterDocs = (spec: Record<string, unknown>): Record<string, unknown> => {
  const paths = isRecord(spec['paths']) ? spec['paths'] : {};
  for (const item of Object.values(paths)) {
    if (!isRecord(item)) continue;
    for (const operation of Object.values(item)) {
      const parameters = isRecord(operation) ? operation['parameters'] : undefined;
      if (!Array.isArray(parameters)) continue;
      for (const parameter of parameters) {
        if (!isRecord(parameter) || !isRecord(parameter['schema'])) continue;
        const { description, examples } = parameter['schema'];
        if (parameter['description'] === undefined && typeof description === 'string') {
          parameter['description'] = description;
        }
        if (parameter['example'] === undefined && Array.isArray(examples)) {
          parameter['example'] = examples[0];
        }
      }
    }
  }
  return spec;
};
