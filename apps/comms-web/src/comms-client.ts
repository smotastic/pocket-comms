import {
  Activity,
  type Agent,
  type AGENTS_TO_START,
  AgentEvent,
  BrainstormEvent,
  type BrainstormState,
  CommsApi,
  type CreateTaskRequest,
  type Issue,
  type IssueDraft,
  type IssueList,
  type IssueTaskCreated,
  type KEYS,
  OverviewState,
  type Overview,
  type Project,
  type ProposalDecisionRequest,
  type Subagent,
  SubagentEvent,
  type TaskCreated,
  type Transcript,
} from '@pocket-comms/comms-contract';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import type { PushSubscriptionView } from './notifications.js';

export type AgentView = typeof Agent.Type;
export type ActivityView = typeof Activity.Type;
export type ActivityEventView = ActivityView['events'][number];
export type OverviewView = typeof Overview.Type;
export type OverviewStateView = typeof OverviewState.Type;
export type TranscriptView = typeof Transcript.Type;
export type AgentEventView = typeof AgentEvent.Type;
export type SubagentView = typeof Subagent.Type;
export type SubagentEventView = typeof SubagentEvent.Type;
export type Key = (typeof KEYS)[number];
export type ProjectView = typeof Project.Type;
export type NewTask = typeof CreateTaskRequest.Type;
export type TaskCreatedView = typeof TaskCreated.Type;
export type AgentToStart = (typeof AGENTS_TO_START)[number];
export type IssueListView = typeof IssueList.Type;
export type IssueView = typeof Issue.Type;
export type IssueTaskCreatedView = typeof IssueTaskCreated.Type;
export type BrainstormStateView = typeof BrainstormState.Type;
export type BrainstormEventView = typeof BrainstormEvent.Type;
export type BrainstormEntryView = Extract<
  BrainstormStateView,
  { readonly _tag: 'Ready' }
>['entries'][number];
export type IssueDraftView = typeof IssueDraft.Type;
export type ProposalDecision = typeof ProposalDecisionRequest.Type;

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
  /** A subagent of the agent's session, with its own conversation. */
  readonly subagent: (ref: string, id: string) => Promise<SubagentView>;
  readonly screen: (ref: string) => Promise<string>;
  /** Sends the text and the attached images, by the ids `uploadImage` gave them (spec 014). */
  readonly prompt: (ref: string, text: string, imageIds?: ReadonlyArray<string>) => Promise<void>;
  /** Uploads one image and answers its id. */
  readonly uploadImage: (image: Blob) => Promise<string>;
  /** Where an uploaded image is served. */
  readonly imageUrl: (id: string) => string;
  /** Types the text into the agent's waiting dialog; it never presses Enter. */
  readonly type: (ref: string, text: string) => Promise<void>;
  readonly keys: (ref: string, keys: ReadonlyArray<Key>) => Promise<void>;
  readonly seen: (ref: string) => Promise<void>;
  /** Removes the agent's worktree and closes its workspace; `force` discards its changes. */
  readonly closeAgent: (ref: string, force: boolean) => Promise<void>;
  readonly projects: () => Promise<ReadonlyArray<ProjectView>>;
  readonly createTask: (task: NewTask) => Promise<TaskCreatedView>;
  readonly issues: (project: string) => Promise<IssueListView>;
  /** `additionalInformation` goes into the agent's first prompt for this launch (spec 021). */
  readonly implementIssue: (
    project: string,
    number: number,
    branch: string,
    additionalInformation?: string,
  ) => Promise<IssueTaskCreatedView>;
  readonly closeIssue: (project: string, number: number) => Promise<void>;
  /** The brainstorm chat (spec 013). */
  readonly brainstorm: () => Promise<BrainstormStateView>;
  /**
   * Sends the owner's message with the attached pictures, by the ids `uploadImage` gave them;
   * Pi's answer arrives on the brainstorm stream.
   */
  readonly sendBrainstorm: (text: string, imageIds?: ReadonlyArray<string>) => Promise<void>;
  readonly decideProposal: (id: string, decision: ProposalDecision) => Promise<void>;
  /** Starts an empty brainstorm chat. */
  readonly resetBrainstorm: () => Promise<void>;
  /** The server's public key, which a device subscribes to push with. */
  readonly pushKey: () => Promise<string>;
  readonly subscribePush: (subscription: PushSubscriptionView) => Promise<void>;
  readonly unsubscribePush: (endpoint: string) => Promise<void>;
  /** The owner's quick replies, one list for every conversation. */
  readonly quickReplies: () => Promise<ReadonlyArray<string>>;
  /** Saves the list in place of the old one and answers it as saved. */
  readonly saveQuickReplies: (replies: ReadonlyArray<string>) => Promise<ReadonlyArray<string>>;
  readonly followBrainstorm: (
    onEvent: (event: BrainstormEventView) => void,
    onLive: OnLive,
  ) => Unsubscribe;
  /** The activity timeline across the agents (spec 017). */
  readonly activity: () => Promise<ActivityView>;
  readonly followActivity: (
    onActivity: (activity: ActivityView) => void,
    onLive: OnLive,
  ) => Unsubscribe;
  readonly followOverview: (
    onState: (state: OverviewStateView) => void,
    onLive: OnLive,
  ) => Unsubscribe;
  readonly followAgent: (
    ref: string,
    onEvent: (event: AgentEventView) => void,
    onLive: OnLive,
  ) => Unsubscribe;
  readonly followSubagent: (
    ref: string,
    id: string,
    onEvent: (event: SubagentEventView) => void,
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
 * a validation problem names, and `problem` the slug of its type, such as `worktree-has-changes`.
 */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly issues: ReadonlyArray<FieldIssue> = [],
    readonly problem?: string,
  ) {
    super(message);
  }
}

const PROBLEM_PREFIX = 'urn:pocket-comms:problem:';

const problemOf = (error: unknown): string | undefined =>
  typeof error === 'object' &&
  error !== null &&
  'type' in error &&
  typeof error.type === 'string' &&
  error.type.startsWith(PROBLEM_PREFIX)
    ? error.type.slice(PROBLEM_PREFIX.length)
    : undefined;

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
    throw new RequestError(messageOf(error), statusOf(error), issuesOf(error), problemOf(error));
  };
  const agent = (ref: string) => ({ params: { agent: ref } });

  return {
    overview: () => run((api) => api.agents.overview()),
    agent: (ref) => run((api) => api.agents.agent(agent(ref))),
    transcript: (ref) => run((api) => api.agents.transcript(agent(ref))),
    subagent: (ref, id) =>
      run((api) => api.agents.subagent({ params: { agent: ref, subagent: id } })),
    screen: (ref) => run((api) => api.agents.screen(agent(ref))).then((screen) => screen.text),
    prompt: (ref, text, imageIds = []) =>
      run((api) =>
        api.agents.prompt({
          ...agent(ref),
          payload: imageIds.length === 0 ? { text } : { text, imageIds },
        }),
      ).then(() => undefined),
    uploadImage: async (image) => {
      const bytes = new Uint8Array(await image.arrayBuffer());
      return run((api) => api.images.upload({ payload: bytes })).then((uploaded) => uploaded.id);
    },
    imageUrl: (id) => `${baseUrl}/api/v1/images/${encodeURIComponent(id)}`,
    type: (ref, text) =>
      run((api) => api.agents.text({ ...agent(ref), payload: { text } })).then(() => undefined),
    keys: (ref, keys) =>
      run((api) => api.agents.keys({ ...agent(ref), payload: { keys } })).then(() => undefined),
    seen: (ref) => run((api) => api.agents.seen(agent(ref))).then(() => undefined),
    closeAgent: (ref, force) =>
      run((api) => api.agents.close({ ...agent(ref), payload: { force } })).then(() => undefined),
    projects: () => run((api) => api.tasks.projects()).then((result) => result.projects),
    createTask: (task) => run((api) => api.tasks.create({ payload: task })),
    issues: (project) => run((api) => api.issues.list({ params: { project } })),
    implementIssue: (project, number, branch, additionalInformation) =>
      run((api) =>
        api.issues.implement({
          params: { project, number: String(number) },
          payload: {
            branch,
            ...(additionalInformation === undefined ? {} : { additionalInformation }),
          },
        }),
      ),
    closeIssue: (project, number) =>
      run((api) => api.issues.close({ params: { project, number: String(number) } })).then(
        () => undefined,
      ),
    brainstorm: () => run((api) => api.brainstorm.state()),
    sendBrainstorm: (text, imageIds = []) =>
      run((api) =>
        api.brainstorm.send({ payload: imageIds.length === 0 ? { text } : { text, imageIds } }),
      ).then(() => undefined),
    // One call per kind of decision, so each payload matches its own request shape.
    decideProposal: (id, decision) =>
      run((api) =>
        decision._tag === 'Create'
          ? api.brainstorm.decide({ params: { proposal: id }, payload: decision })
          : decision._tag === 'Apply'
            ? api.brainstorm.decide({ params: { proposal: id }, payload: decision })
            : decision._tag === 'Discard'
              ? api.brainstorm.decide({ params: { proposal: id }, payload: decision })
              : api.brainstorm.decide({ params: { proposal: id }, payload: decision }),
      ).then(() => undefined),
    resetBrainstorm: () => run((api) => api.brainstorm.reset()).then(() => undefined),
    pushKey: () => run((api) => api.push.key()).then((key) => key.publicKey),
    subscribePush: (subscription) =>
      run((api) => api.push.subscribe({ payload: subscription })).then(() => undefined),
    unsubscribePush: (endpoint) =>
      run((api) => api.push.unsubscribe({ payload: { endpoint } })).then(() => undefined),
    quickReplies: () => run((api) => api.quickReplies.list()).then((saved) => saved.replies),
    saveQuickReplies: (replies) =>
      run((api) => api.quickReplies.replace({ payload: { replies } })).then(
        (saved) => saved.replies,
      ),
    followBrainstorm: (onEvent, onLive) =>
      follow(`${baseUrl}/api/v1/brainstorm/events`, 'brainstorm', BrainstormEvent, onEvent, onLive),
    activity: () => run((api) => api.activity.activity()),
    followActivity: (onActivity, onLive) =>
      follow(`${baseUrl}/api/v1/activity/events`, 'activity', Activity, onActivity, onLive),
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
    followSubagent: (ref, id, onEvent, onLive) =>
      follow(
        `${baseUrl}/api/v1/agents/${encodeURIComponent(ref)}/subagents/${encodeURIComponent(id)}/events`,
        'subagent',
        SubagentEvent,
        onEvent,
        onLive,
      ),
  };
};
