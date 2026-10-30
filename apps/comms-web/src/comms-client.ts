import {
  type Agent,
  AgentEvent,
  CommsApi,
  type KEYS,
  OverviewState,
  type Overview,
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

/** A failed request; `status` is the HTTP status of a Problem Details answer. */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
  ) {
    super(message);
  }
}

const statusOf = (error: unknown): number | undefined =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  typeof error.status === 'number'
    ? error.status
    : undefined;

/**
 * Follows one server-sent event stream with the browser's `EventSource`, which reconnects by
 * itself. Each event decodes with the contract's schema; one that does not is skipped.
 */
const follow = <A>(
  url: string,
  name: string,
  schema: Schema.Decoder<A>,
  onData: (data: A) => void,
  onLive: OnLive,
): Unsubscribe => {
  const decode = Schema.decodeUnknownExit(Schema.fromJsonString(schema));
  const source = new EventSource(url);
  source.onopen = () => onLive(true);
  source.onerror = () => onLive(false);
  source.addEventListener(name, (event) => {
    const decoded = decode(event.data);
    if (Exit.isSuccess(decoded)) onData(decoded.value);
  });
  return () => source.close();
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
    throw new RequestError(messageOf(error), statusOf(error));
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
