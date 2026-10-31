import {
  type Agent,
  type AGENTS_TO_START,
  AgentEvent,
  CommsApi,
  type CreateTaskRequest,
  type KEYS,
  OverviewState,
  type Overview,
  type Project,
  type TaskCreated,
  type Transcript,
} from '@pocket-comms/comms-contract';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';

export type AgentView = typeof Agent.Type;
export type OverviewView = typeof Overview.Type;
export type OverviewStateView = typeof OverviewState.Type;
export type TranscriptView = typeof Transcript.Type;
export type AgentEventView = typeof AgentEvent.Type;
export type Key = (typeof KEYS)[number];
export type ProjectView = typeof Project.Type;
export type NewTask = typeof CreateTaskRequest.Type;
export type TaskCreatedView = typeof TaskCreated.Type;
export type AgentToStart = (typeof AGENTS_TO_START)[number];

/** Stops a live subscription. */
export type Unsubscribe = () => void;

/** What a live subscription reports besides its events: whether it is connected. */
export type OnLive = (live: boolean) => void;

/**
 * What the screens need from the API, as plain promises and callbacks. Tests pass a fake; the app
 * passes `makeCommsClient`.
 */
export interface CommsClient {
  readonly overview: () => Promise<OverviewView>;
  readonly agent: (ref: string) => Promise<AgentView>;
  readonly transcript: (ref: string) => Promise<TranscriptView>;
  readonly screen: (ref: string) => Promise<string>;
  readonly prompt: (ref: string, text: string) => Promise<void>;
  readonly keys: (ref: string, keys: ReadonlyArray<Key>) => Promise<void>;
  readonly seen: (ref: string) => Promise<void>;
  readonly projects: () => Promise<ReadonlyArray<ProjectView>>;
  readonly createTask: (task: NewTask) => Promise<TaskCreatedView>;
  readonly followOverview: (
    onState: (state: OverviewStateView) => void,
    onLive: OnLive,
  ) => Unsubscribe;
  readonly followAgent: (
    ref: string,
    onEvent: (event: AgentEventView) => void,
    onLive: OnLive,
  ) => Unsubscribe;
}

// A Problem Details response carries a readable `detail`; anything else falls back to its message.
const messageOf = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    if ('detail' in error && typeof error.detail === 'string') return error.detail;
    if ('title' in error && typeof error.title === 'string') return error.title;
    if ('message' in error && typeof error.message === 'string') return error.message;
  }
  return 'The request failed.';
};

/** One field a validation problem names, such as the branch of a new task. */
export interface FieldIssue {
  readonly field: string;
  readonly message: string;
}

/**
 * A failed request; `status` is the HTTP status of a Problem Details answer, `issues` the fields
 * a validation problem names.
 */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly issues: ReadonlyArray<FieldIssue> = [],
  ) {
    super(message);
  }
}

const isFieldIssue = (value: unknown): value is FieldIssue =>
  typeof value === 'object' &&
  value !== null &&
  'field' in value &&
  typeof value.field === 'string' &&
  'message' in value &&
  typeof value.message === 'string';

const issuesOf = (error: unknown): ReadonlyArray<FieldIssue> =>
  typeof error === 'object' && error !== null && 'errors' in error && Array.isArray(error.errors)
    ? error.errors.filter(isFieldIssue)
    : [];

const statusOf = (error: unknown): number | undefined =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  typeof error.status === 'number'
    ? error.status
    : undefined;

// How long to wait before opening a stream again that the browser gave up on.
const REOPEN_MS = 3_000;

/**
 * Follows one server-sent event stream with the browser's `EventSource`. The browser reconnects
 * by itself after a dropped connection, but gives up for good when a reconnect gets an error
 * status, as when the server restarts behind `tailscale serve`; then this opens the stream again.
 * Each event decodes with the contract's schema; one that does not is skipped.
 */
const follow = <A>(
  url: string,
  name: string,
  schema: Schema.Decoder<A>,
  onData: (data: A) => void,
  onLive: OnLive,
): Unsubscribe => {
  const decode = Schema.decodeUnknownExit(Schema.fromJsonString(schema));
  let source: EventSource | undefined;
  let reopen: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const open = () => {
    const current = new EventSource(url);
    source = current;
    current.onopen = () => onLive(true);
    current.onerror = () => {
      onLive(false);
      if (current.readyState === EventSource.CLOSED && !stopped) {
        reopen = setTimeout(open, REOPEN_MS);
      }
    };
    current.addEventListener(name, (event) => {
      const decoded = decode(event.data);
      if (Exit.isSuccess(decoded)) onData(decoded.value);
    });
  };
  open();
  return () => {
    stopped = true;
    clearTimeout(reopen);
    source?.close();
  };
};

/** The typed client of the comms contract (ADR 0008), served under `baseUrl`. */
export const makeCommsClient = (baseUrl: string): CommsClient => {
  const client = HttpApiClient.make(CommsApi, { baseUrl });
  type Client = Effect.Success<typeof client>;

  const run = async <A, E>(request: (api: Client) => Effect.Effect<A, E>): Promise<A> => {
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(client, request).pipe(Effect.provide(FetchHttpClient.layer)),
    );
    if (Exit.isSuccess(exit)) return exit.value;
    const error = Cause.squash(exit.cause);
    throw new RequestError(messageOf(error), statusOf(error), issuesOf(error));
  };
  const agent = (ref: string) => ({ params: { agent: ref } });

  return {
    overview: () => run((api) => api.agents.overview()),
    agent: (ref) => run((api) => api.agents.agent(agent(ref))),
    transcript: (ref) => run((api) => api.agents.transcript(agent(ref))),
    screen: (ref) => run((api) => api.agents.screen(agent(ref))).then((screen) => screen.text),
    prompt: (ref, text) =>
      run((api) => api.agents.prompt({ ...agent(ref), payload: { text } })).then(() => undefined),
    keys: (ref, keys) =>
      run((api) => api.agents.keys({ ...agent(ref), payload: { keys } })).then(() => undefined),
    seen: (ref) => run((api) => api.agents.seen(agent(ref))).then(() => undefined),
    projects: () => run((api) => api.tasks.projects()).then((result) => result.projects),
    createTask: (task) => run((api) => api.tasks.create({ payload: task })),
    followOverview: (onState, onLive) =>
      follow(`${baseUrl}/api/v1/events`, 'overview', OverviewState, onState, onLive),
    followAgent: (ref, onEvent, onLive) =>
      follow(
        `${baseUrl}/api/v1/agents/${encodeURIComponent(ref)}/events`,
        'agent',
        AgentEvent,
        onEvent,
        onLive,
      ),
  };
};
