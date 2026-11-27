import {
  Activity,
  type Agent,
  type AGENTS_TO_START,
  AgentEvent,
  type BrainstormEntry,
  BrainstormEvent,
  type BrainstormState,
  CommsApi,
  type CreateTaskRequest,
  type Issue,
  type ProposedIssue,
  type IssueList,
  type IssueTaskCreated,
  type KEYS,
  OverviewState,
  type Overview,
  type Planet,
  type Planets,
  type Preflight,
  type Mission,
  type Missions,
  type Autopilot,
  type ProposalDecisionRequest,
  type AttachedPullRequest,
  type PullRequestChanges,
  type Subagent,
  SubagentEvent,
  type TaskCreated,
  type TaskStartSent,
  type TaskStartView as TaskStartSchema,
  type Conversation,
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
export type ConversationView = typeof Conversation.Type;
export type AgentEventView = typeof AgentEvent.Type;
export type SubagentView = typeof Subagent.Type;
export type SubagentEventView = typeof SubagentEvent.Type;
export type Key = (typeof KEYS)[number];
export type PlanetView = typeof Planet.Type;
export type PlanetsView = typeof Planets.Type;
export type PreflightView = typeof Preflight.Type;
export type AutonomyLevel = PreflightView['autonomy']['chosen'];
export type MissionView = typeof Mission.Type;
export type MissionsView = typeof Missions.Type;
export type Lane = MissionView['lane'];
export type AutopilotView = typeof Autopilot.Type;
export type AutopilotSettingsView = AutopilotView['settings'];
export type NewTask = typeof CreateTaskRequest.Type;
export type TaskCreatedView = typeof TaskCreated.Type;
export type AgentToStart = (typeof AGENTS_TO_START)[number];
export type IssueListView = typeof IssueList.Type;
export type IssueView = typeof Issue.Type;
export type IssueTaskCreatedView = typeof IssueTaskCreated.Type;
export type BrainstormStateView = typeof BrainstormState.Type;
export type BrainstormEventView = typeof BrainstormEvent.Type;
/** One of the brainstorm's own entries, among the agent package's shared ones. */
export type BrainstormEntryView = typeof BrainstormEntry.Type;
export type ProposedIssueView = typeof ProposedIssue.Type;
export type ProposalDecision = typeof ProposalDecisionRequest.Type;
export type AttachedPullRequestView = typeof AttachedPullRequest.Type;
export type PullRequestChangesView = typeof PullRequestChanges.Type;
export type ChangedFileView = PullRequestChangesView['files'][number];
export type TaskStartView = typeof TaskStartSchema.Type;
export type TaskStartSentView = typeof TaskStartSent.Type;

/** A task start's prompt as the owner sends it (spec 032). */
export interface TaskStartSend {
  readonly prompt: string;
  /** The owner saw that the prompt may have arrived and sends it anyway. */
  readonly anyway?: boolean;
  /** Send the issue's task to an agent whose worktree has no kept start. */
  readonly fromIssue?: boolean;
}

/** A pull request by its repository and number. */
export interface PullRequestRef {
  readonly owner: string;
  readonly name: string;
  readonly number: number;
}

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
  /** The pull requests attached to the agent (spec 031), with their title and state now. */
  readonly pullRequests: (ref: string) => Promise<ReadonlyArray<AttachedPullRequestView>>;
  /** The changed files of an attached pull request, read from Gitea now. */
  readonly pullRequestChanges: (
    ref: string,
    pullRequest: PullRequestRef,
  ) => Promise<PullRequestChangesView>;
  /** Removes the pull request from the agent's list; Gitea does not change. */
  readonly removePullRequest: (ref: string, pullRequest: PullRequestRef) => Promise<void>;
  readonly agent: (ref: string) => Promise<AgentView>;
  readonly conversation: (ref: string) => Promise<ConversationView>;
  /** A subagent of the agent's session, with its own conversation. */
  readonly subagent: (ref: string, id: string) => Promise<SubagentView>;
  readonly screen: (ref: string) => Promise<string>;
  /** Sends the text and the attached images, by the ids `uploadImage` gave them (spec 014). */
  readonly prompt: (ref: string, text: string, imageIds?: ReadonlyArray<string>) => Promise<void>;
  /** Uploads one image and answers its id. */
  readonly uploadImage: (image: Blob) => Promise<string>;
  /** Where an uploaded image is served. */
  readonly imageUrl: (id: string) => string;
  /** Whether the server transcribes voice messages, for every composer. */
  readonly speech: () => Promise<boolean>;
  /** Turns a recorded voice message into text, possibly empty. */
  readonly transcribe: (voiceMessage: Blob) => Promise<string>;
  /** Types the text into the agent's waiting dialog; it never presses Enter. */
  readonly type: (ref: string, text: string) => Promise<void>;
  readonly keys: (ref: string, keys: ReadonlyArray<Key>) => Promise<void>;
  /**
   * Answers the waiting question call `call` with the chosen options' indexes, one list per
   * question; a `question-not-waiting` problem means the question was answered or moved on.
   */
  readonly answer: (
    ref: string,
    call: string,
    answers: ReadonlyArray<ReadonlyArray<number>>,
  ) => Promise<void>;
  readonly seen: (ref: string) => Promise<void>;
  /** Removes the agent's worktree and closes its workspace; `force` discards its changes. */
  readonly closeAgent: (ref: string, force: boolean) => Promise<void>;
  /** The planets and the repositories below the root that are not planets (spec 034). */
  readonly planets: () => Promise<PlanetsView>;
  /** Makes a repository below the root a planet. */
  readonly registerPlanet: (name: string) => Promise<void>;
  /** Removes the planet and its settings; its agents keep running. */
  readonly unregisterPlanet: (planet: string) => Promise<void>;
  /** Whether the planet is ready for missions: its checks, go or no-go and the levels. */
  readonly preflight: (planet: string) => Promise<PreflightView>;
  /** Sets a planet's chosen autonomy level: manual, missions or autopilot (specs 035, 038). */
  readonly chooseAutonomy: (planet: string, level: AutonomyLevel) => Promise<void>;
  /** Lifts the pause of a planet's failed deploy and closes its fix issue (spec 037). */
  readonly resumePlanet: (planet: string) => Promise<void>;
  /** Sets the apps a planet's releases may deploy (spec 037). */
  readonly allowApps: (planet: string, apps: ReadonlyArray<string>) => Promise<void>;
  /** Sends an open issue on a mission in `lane` (spec 035). */
  readonly sendOnMission: (planet: string, number: number, lane: Lane) => Promise<MissionView>;
  /** Mission Control: the running mission, the mission queue and the mission log. */
  readonly missions: () => Promise<MissionsView>;
  readonly removeMission: (id: string) => Promise<void>;
  readonly abortMission: (id: string) => Promise<void>;
  readonly resumeMission: (id: string) => Promise<void>;
  /** The owner's Deploy of a mission that waits for it (spec 036). */
  readonly deployMission: (id: string) => Promise<void>;
  /** Marks the mission log seen. */
  readonly missionsSeen: () => Promise<void>;
  /** Autopilot: its settings and the current or latest window (spec 038). */
  readonly autopilot: () => Promise<AutopilotView>;
  /** Keeps the Autopilot switch, window and budget. */
  readonly updateAutopilot: (settings: AutopilotSettingsView) => Promise<AutopilotView>;
  readonly createTask: (task: NewTask) => Promise<TaskCreatedView>;
  readonly issues: (planet: string) => Promise<IssueListView>;
  /** `additionalInformation` goes into the agent's first prompt for this launch (spec 021). */
  readonly implementIssue: (
    planet: string,
    number: number,
    branch: string,
    additionalInformation?: string,
  ) => Promise<IssueTaskCreatedView>;
  readonly closeIssue: (planet: string, number: number) => Promise<void>;
  /**
   * The task start of the agent's worktree whose first prompt was not delivered (spec 032), or
   * with `fromIssue` its issue's task; none when there is nothing to recover.
   */
  readonly taskStart: (ref: string, fromIssue: boolean) => Promise<TaskStartView | undefined>;
  /** Sends the task start's prompt while the agent is idle and ready. */
  readonly sendTaskStart: (ref: string, send: TaskStartSend) => Promise<TaskStartSentView>;
  /** Forgets the task start without sending anything. */
  readonly dismissTaskStart: (ref: string) => Promise<void>;
  /** Starts an agent in the issue's existing worktree on `branch`. */
  readonly startAgentInWorktree: (
    planet: string,
    number: number,
    branch: string,
    agent: AgentToStart,
  ) => Promise<TaskCreatedView>;
  /** The brainstorm (spec 013). */
  readonly brainstorm: () => Promise<BrainstormStateView>;
  /**
   * Sends the owner's message with the attached images, by the ids `uploadImage` gave them;
   * Pi's answer arrives on the brainstorm stream.
   */
  readonly sendBrainstorm: (text: string, imageIds?: ReadonlyArray<string>) => Promise<void>;
  readonly decideProposal: (id: string, decision: ProposalDecision) => Promise<void>;
  /** Starts an empty brainstorm. */
  readonly resetBrainstorm: () => Promise<void>;
  /** The server's public key, which a device subscribes to push with. */
  readonly pushKey: () => Promise<string>;
  readonly subscribePush: (subscription: PushSubscriptionView) => Promise<void>;
  readonly unsubscribePush: (endpoint: string) => Promise<void>;
  /** The owner's quick replies, one list for every conversation. */
  readonly quickReplies: () => Promise<ReadonlyArray<string>>;
  /** Saves the list in place of the old one and answers it as saved. */
  readonly saveQuickReplies: (replies: ReadonlyArray<string>) => Promise<ReadonlyArray<string>>;
  /**
   * Follows the brainstorm after the entry `after()` answers, the last one the reader has;
   * after a lost connection it follows again from the reader's new last one (spec 026).
   */
  readonly followBrainstorm: (
    after: () => number,
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
 * A `url` that is a function names where the reader is, so after any error the stream is closed
 * and opened again at the function's new address, never at the old one the browser would reuse.
 * Each event decodes with the contract's schema; one that does not is skipped.
 */
const follow = <A>(
  url: string | (() => string),
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
    const current = new EventSource(typeof url === 'string' ? url : url());
    source = current;
    current.onopen = () => onLive(true);
    current.onerror = () => {
      onLive(false);
      if (typeof url !== 'string') current.close();
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
  const pullRequest = (ref: string, { owner, name, number }: PullRequestRef) => ({
    params: { agent: ref, owner, repository: name, number: String(number) },
  });

  return {
    overview: () => run((api) => api.agents.overview()),
    pullRequests: (ref) =>
      run((api) => api.pullRequests.list(agent(ref))).then((list) => list.pullRequests),
    pullRequestChanges: (ref, request) =>
      run((api) => api.pullRequests.changes(pullRequest(ref, request))),
    removePullRequest: (ref, request) =>
      run((api) => api.pullRequests.remove(pullRequest(ref, request))).then(() => undefined),
    agent: (ref) => run((api) => api.agents.agent(agent(ref))),
    conversation: (ref) => run((api) => api.agents.conversation(agent(ref))),
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
    speech: () => run((api) => api.speech.state()).then((state) => state.available),
    transcribe: async (voiceMessage) => {
      const bytes = new Uint8Array(await voiceMessage.arrayBuffer());
      return run((api) => api.speech.transcribe({ payload: bytes })).then((result) => result.text);
    },
    type: (ref, text) =>
      run((api) => api.agents.text({ ...agent(ref), payload: { text } })).then(() => undefined),
    keys: (ref, keys) =>
      run((api) => api.agents.keys({ ...agent(ref), payload: { keys } })).then(() => undefined),
    answer: (ref, call, answers) =>
      run((api) => api.agents.answer({ ...agent(ref), payload: { call, answers } })).then(
        () => undefined,
      ),
    seen: (ref) => run((api) => api.agents.seen(agent(ref))).then(() => undefined),
    closeAgent: (ref, force) =>
      run((api) => api.agents.close({ ...agent(ref), payload: { force } })).then(() => undefined),
    planets: () => run((api) => api.planets.list()),
    registerPlanet: (name) =>
      run((api) => api.planets.register({ payload: { name } })).then(() => undefined),
    unregisterPlanet: (planet) =>
      run((api) => api.planets.unregister({ params: { planet } })).then(() => undefined),
    preflight: (planet) => run((api) => api.planets.preflight({ params: { planet } })),
    chooseAutonomy: (planet, level) =>
      run((api) => api.planets.chooseAutonomy({ params: { planet }, payload: { level } })).then(
        () => undefined,
      ),
    resumePlanet: (planet) =>
      run((api) => api.missions.resumePlanet({ params: { planet } })).then(() => undefined),
    allowApps: (planet, apps) =>
      run((api) => api.planets.allowApps({ params: { planet }, payload: { apps } })).then(
        () => undefined,
      ),
    sendOnMission: (planet, number, lane) =>
      run((api) =>
        api.issues.sendOnMission({ params: { planet, number: String(number) }, payload: { lane } }),
      ),
    missions: () => run((api) => api.missions.list()),
    removeMission: (id) =>
      run((api) => api.missions.remove({ params: { mission: id } })).then(() => undefined),
    abortMission: (id) =>
      run((api) => api.missions.abort({ params: { mission: id } })).then(() => undefined),
    resumeMission: (id) =>
      run((api) => api.missions.resume({ params: { mission: id } })).then(() => undefined),
    deployMission: (id) =>
      run((api) => api.missions.deploy({ params: { mission: id } })).then(() => undefined),
    missionsSeen: () => run((api) => api.missions.seen()).then(() => undefined),
    autopilot: () => run((api) => api.autopilot.read()),
    updateAutopilot: (settings) =>
      run((api) => api.autopilot.updateSettings({ payload: settings })),
    createTask: (task) => run((api) => api.tasks.create({ payload: task })),
    issues: (planet) => run((api) => api.issues.list({ params: { planet } })),
    implementIssue: (planet, number, branch, additionalInformation) =>
      run((api) =>
        api.issues.implement({
          params: { planet, number: String(number) },
          payload: {
            branch,
            ...(additionalInformation === undefined ? {} : { additionalInformation }),
          },
        }),
      ),
    closeIssue: (planet, number) =>
      run((api) => api.issues.close({ params: { planet, number: String(number) } })).then(
        () => undefined,
      ),
    taskStart: (ref, fromIssue) =>
      run((api) =>
        api.taskStarts.read({ ...agent(ref), query: fromIssue ? { fromIssue: 'true' } : {} }),
      ).then((result) => result.start ?? undefined),
    sendTaskStart: (ref, send) =>
      run((api) =>
        api.taskStarts.send({
          ...agent(ref),
          payload: {
            prompt: send.prompt,
            ...(send.anyway === true ? { anyway: true } : {}),
            ...(send.fromIssue === true ? { fromIssue: true } : {}),
          },
        }),
      ),
    dismissTaskStart: (ref) =>
      run((api) => api.taskStarts.dismiss(agent(ref))).then(() => undefined),
    startAgentInWorktree: (planet, number, branch, kind) =>
      run((api) =>
        api.taskStarts.startAgent({
          params: { planet, number: String(number) },
          payload: { branch, agent: kind },
        }),
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
    followBrainstorm: (after, onEvent, onLive) =>
      follow(
        () => `${baseUrl}/api/v1/brainstorm/events?after=${after()}`,
        'brainstorm',
        BrainstormEvent,
        onEvent,
        onLive,
      ),
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
