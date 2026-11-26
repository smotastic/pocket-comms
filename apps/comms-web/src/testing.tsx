import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { configure, render } from '@testing-library/react';
import { MicrophoneProvider, type Microphone } from '@smotastic/pocket-design';
import { fakeMicrophone } from '@smotastic/pocket-design/testing';
import {
  RequestError,
  type ActivityView,
  type AttachedPullRequestView,
  type PullRequestChangesView,
  type PullRequestRef,
  type AgentEventView,
  type AgentView,
  type BrainstormEventView,
  type BrainstormStateView,
  type CommsClient,
  type IssueListView,
  type IssueTaskCreatedView,
  type Key,
  type NewTask,
  type OverviewStateView,
  type OverviewView,
  type PlanetView,
  type ProposalDecision,
  type SubagentEventView,
  type SubagentView,
  type TaskCreatedView,
  type TaskStartSend,
  type TaskStartSentView,
  type TaskStartView,
  type AgentToStart,
  type ConversationView,
} from './comms-client.js';
import { ImageHandlingContext, UnreadableImageError, type ImageHandling } from './attachments.js';
import {
  DevicePushContext,
  type DevicePush,
  type DevicePushState,
  type PushSubscriptionView,
} from './notifications.js';
import { createAppRouter } from './router.js';

// The kit loads its Markdown renderer lazily; on a cold CI runner that first import alone can take
// longer than the default one second a `findBy` waits.
configure({ asyncUtilTimeout: 5_000 });

/** An agent with plain defaults: an idle Claude agent named kirk, changed a minute ago. */
export const fakeAgent = (overrides: Partial<AgentView> = {}): AgentView => ({
  ref: 'kirk',
  paneId: 'w1:p1',
  name: 'kirk',
  kind: 'claude',
  format: 'claude',
  status: 'idle',
  title: 'Fix the build',
  cwd: '/work/app',
  workspace: 'app',
  planet: 'app',
  changedAt: Date.now() - 60_000,
  needsYou: false,
  background: [],
  ...overrides,
});

export interface FakeState {
  overview: OverviewView;
  /** Each agent's attached pull requests, by its ref. */
  readonly pullRequests: Map<string, Array<AttachedPullRequestView>>;
  /** Each pull request's changes, by `<owner>/<name>#<number>`, or a failure. */
  readonly pullRequestChanges: Map<string, PullRequestChangesView | RequestError>;
  readonly agents: Map<string, AgentView>;
  readonly conversations: Map<string, ConversationView>;
  /** The subagents of each agent, by `<ref>/<id>`. */
  readonly subagents: Map<string, SubagentView>;
  readonly screens: Map<string, string>;
  /** A failure for the next prompt, as the server would report it. */
  promptFailure?: string;
  /** A failure for the next typed text. */
  typeFailure?: string;
  /** Holds typed text on its way until it resolves, such as to see the page meanwhile. */
  typeGate?: Promise<void>;
  /** A failure for the next answer to a question, as the server would report it. */
  answerFailure?: RequestError;
  /** A failure for the next image upload. */
  uploadFailure?: string;
  /** Whether the server transcribes voice messages. */
  speechAvailable: boolean;
  /** What the next voice message is transcribed to, or a failure. */
  transcription: string | RequestError;
  /** Holds a transcription on its way until it resolves, such as to see the wait. */
  transcriptionGate?: Promise<void>;
  /** Holds a prompt on its way until it resolves. */
  promptGate?: Promise<void>;
  /** Holds a brainstorm message on its way until it resolves. */
  sendGate?: Promise<void>;
  planets: ReadonlyArray<PlanetView>;
  /** The repositories below the root that are not planets. */
  others: ReadonlyArray<string>;
  /** What the next task creation answers: the created worktree, or a failure. */
  created: TaskCreatedView | RequestError;
  /** Each planet's issues, or a failure; a planet without an entry has no Gitea remote. */
  readonly issues: Map<string, IssueListView | RequestError>;
  /** What the next Implement with Claude answers. */
  implemented: IssueTaskCreatedView | RequestError;
  /** A failure for the next close; without one the issue leaves its planet's list. */
  closeFailure?: RequestError;
  /** The failures of the next agent closes, in order; a close without one succeeds. */
  closeAgentFailures: Array<RequestError>;
  /** The brainstorm's state as the server holds it. */
  brainstorm: BrainstormStateView;
  /** The brainstorm's entries, numbered from 1, which a sheet that follows gets first. */
  brainstormLog: Array<BrainstormEventView & { readonly kind: 'entry' }>;
  /** A failure for the next brainstorm message or decision, as the server would report it. */
  brainstormFailure?: RequestError;
  /** The activity timeline as the server holds it, newest first. */
  activity: ActivityView;
  /** A failure for the next push subscription. */
  subscribeFailure?: RequestError;
  /** The owner's quick replies as the server keeps them. */
  quickReplies: ReadonlyArray<string>;
  /** A failure for the next save of the quick replies. */
  saveQuickRepliesFailure?: RequestError;
  /** Each agent's task start by its ref, and with `?issue` the one its issue's task makes. */
  readonly taskStarts: Map<string, TaskStartView>;
  /** What the next send of a task start answers, or a failure. */
  taskStartSent: TaskStartSentView | RequestError;
  /** What the next Start an agent here answers. */
  startedInWorktree: TaskCreatedView | RequestError;
}

/**
 * A stand-in for the API that records every command. `emitOverview`, `emitAgent`,
 * `emitBrainstorm` and `emitActivity` push live events to the screens that follow them.
 */
export const fakeClient = (initial: Partial<FakeState> = {}) => {
  const state: FakeState = {
    overview: { needsYou: [], groups: [] },
    pullRequests: new Map(),
    pullRequestChanges: new Map(),
    agents: new Map(),
    conversations: new Map(),
    subagents: new Map(),
    screens: new Map(),
    planets: [
      { name: 'pocket-comms', open: true },
      { name: 'pocket-home', open: false },
    ],
    others: [],
    created: { workspace: 'wK', branch: 'feat/x', path: '/worktrees/feat-x' },
    issues: new Map(),
    implemented: { workspace: 'wK', branch: 'feat/1-x', path: '/worktrees/feat-1-x' },
    closeAgentFailures: [],
    speechAvailable: false,
    transcription: 'dark mode for pocket-home',
    brainstorm: {
      _tag: 'Ready',
      answering: false,
      seesImages: true,
      images: [],
      voice: false,
    },
    brainstormLog: [],
    activity: { events: [] },
    quickReplies: ['Go ahead', 'Commit and open a PR'],
    taskStarts: new Map(),
    taskStartSent: { delivery: 'delivered' },
    startedInWorktree: { workspace: 'w5', branch: 'fix/12-login', path: '/worktrees/fix-12-login' },
    ...initial,
  };
  const calls = {
    prompts: [] as Array<[string, string]>,
    /** The image ids of each prompt, in the order of `prompts`. */
    promptImages: [] as Array<ReadonlyArray<string>>,
    uploads: [] as Array<Blob>,
    /** How often the app asked whether the server transcribes. */
    speechAsked: 0,
    /** The voice messages sent for transcription. */
    voiceMessages: [] as Array<Blob>,
    keys: [] as Array<[string, ReadonlyArray<Key>]>,
    typed: [] as Array<[string, string]>,
    answers: [] as Array<[string, string, ReadonlyArray<ReadonlyArray<number>>]>,
    seen: [] as Array<string>,
    registered: [] as Array<string>,
    unregistered: [] as Array<string>,
    tasks: [] as Array<NewTask>,
    implemented: [] as Array<[string, number, string, string?]>,
    closed: [] as Array<[string, number]>,
    closedAgents: [] as Array<[string, boolean]>,
    brainstormMessages: [] as Array<string>,
    /** The image ids of each brainstorm message, in the order of `brainstormMessages`. */
    brainstormImageIds: [] as Array<ReadonlyArray<string>>,
    decisions: [] as Array<[string, ProposalDecision]>,
    brainstormResets: 0,
    /** Where each follow of the brainstorm started: the `after` it asked for. */
    brainstormFollows: [] as Array<number>,
    pushKeys: 0,
    subscribed: [] as Array<PushSubscriptionView>,
    unsubscribed: [] as Array<string>,
    savedQuickReplies: [] as Array<ReadonlyArray<string>>,
    /** How often each agent's pull requests and each pull request's changes were read. */
    pullRequestReads: [] as Array<string>,
    changesReads: [] as Array<string>,
    removedPullRequests: [] as Array<[string, string]>,
    taskStartSends: [] as Array<[string, TaskStartSend]>,
    dismissedTaskStarts: [] as Array<string>,
    startedInWorktree: [] as Array<[string, number, string, AgentToStart]>,
  };
  const brainstormFollowers = new Set<(event: BrainstormEventView) => void>();
  const failBrainstorm = () => {
    const failure = state.brainstormFailure;
    state.brainstormFailure = undefined;
    if (failure !== undefined) throw failure;
  };
  const overviewFollowers = new Set<(state: OverviewStateView) => void>();
  const activityFollowers = new Set<(activity: ActivityView) => void>();
  const agentFollowers = new Map<string, Set<(event: AgentEventView) => void>>();
  const subagentFollowers = new Map<string, Set<(event: SubagentEventView) => void>>();

  const find = (ref: string) => {
    const agent = state.agents.get(ref);
    if (agent === undefined) throw new RequestError(`No live agent is named ${ref}.`, 404);
    return agent;
  };

  const prKey = ({ owner, name, number }: PullRequestRef) => `${owner}/${name}#${number}`;
  const client: CommsClient = {
    overview: async () => state.overview,
    pullRequests: async (ref) => {
      calls.pullRequestReads.push(ref);
      return [...(state.pullRequests.get(ref) ?? [])];
    },
    pullRequestChanges: async (_ref, pullRequest) => {
      calls.changesReads.push(prKey(pullRequest));
      const changes = state.pullRequestChanges.get(prKey(pullRequest));
      if (changes === undefined) throw new RequestError('Pull request not found', 404);
      if (changes instanceof RequestError) throw changes;
      return changes;
    },
    removePullRequest: async (ref, pullRequest) => {
      calls.removedPullRequests.push([ref, prKey(pullRequest)]);
      state.pullRequests.set(
        ref,
        (state.pullRequests.get(ref) ?? []).filter((entry) => prKey(entry) !== prKey(pullRequest)),
      );
    },
    agent: async (ref) => find(ref),
    conversation: async (ref) =>
      state.conversations.get(ref) ?? { entries: [], currentStep: 'Thinking…' },
    subagent: async (ref, id) => {
      const subagent = state.subagents.get(`${ref}/${id}`);
      if (subagent === undefined) throw new RequestError(`${ref} has no subagent ${id}.`, 404);
      return subagent;
    },
    screen: async (ref) => state.screens.get(ref) ?? '',
    prompt: async (ref, text, imageIds = []) => {
      await state.promptGate;
      if (state.promptFailure !== undefined) throw new RequestError(state.promptFailure, 409);
      calls.prompts.push([ref, text]);
      calls.promptImages.push(imageIds);
    },
    uploadImage: async (image) => {
      const failure = state.uploadFailure;
      state.uploadFailure = undefined;
      if (failure !== undefined) throw new RequestError(failure, 422);
      calls.uploads.push(image);
      return `image-${calls.uploads.length}`;
    },
    imageUrl: (id) => `/api/v1/images/${id}`,
    speech: async () => {
      calls.speechAsked += 1;
      return state.speechAvailable;
    },
    transcribe: async (voiceMessage) => {
      calls.voiceMessages.push(voiceMessage);
      await state.transcriptionGate;
      if (state.transcription instanceof RequestError) throw state.transcription;
      return state.transcription;
    },
    type: async (ref, text) => {
      await state.typeGate;
      if (state.typeFailure !== undefined) throw new RequestError(state.typeFailure, 409);
      calls.typed.push([ref, text]);
    },
    keys: async (ref, keys) => {
      calls.keys.push([ref, keys]);
    },
    answer: async (ref, call, answers) => {
      const failure = state.answerFailure;
      state.answerFailure = undefined;
      if (failure !== undefined) throw failure;
      calls.answers.push([ref, call, answers]);
    },
    seen: async (ref) => {
      calls.seen.push(ref);
    },
    planets: async () => ({ planets: state.planets, others: state.others }),
    registerPlanet: async (name) => {
      calls.registered.push(name);
      state.others = state.others.filter((other) => other !== name);
      state.planets = [...state.planets, { name, open: false }];
    },
    unregisterPlanet: async (planet) => {
      calls.unregistered.push(planet);
      state.planets = state.planets.filter((each) => each.name !== planet);
      state.others = [...state.others, planet];
    },
    createTask: async (task) => {
      calls.tasks.push(task);
      if (state.created instanceof RequestError) throw state.created;
      return state.created;
    },
    issues: async (planet) => {
      const list = state.issues.get(planet) ?? { _tag: 'NoGiteaRemote' };
      if (list instanceof RequestError) throw list;
      return list;
    },
    implementIssue: async (planet, number, branch, additionalInformation) => {
      calls.implemented.push(
        additionalInformation === undefined
          ? [planet, number, branch]
          : [planet, number, branch, additionalInformation],
      );
      if (state.implemented instanceof RequestError) throw state.implemented;
      return state.implemented;
    },
    taskStart: async (ref, fromIssue) => state.taskStarts.get(fromIssue ? `${ref}?issue` : ref),
    sendTaskStart: async (ref, send) => {
      calls.taskStartSends.push([ref, send]);
      if (state.taskStartSent instanceof RequestError) throw state.taskStartSent;
      if (state.taskStartSent.delivery === 'delivered') {
        state.taskStarts.delete(ref);
        state.taskStarts.delete(`${ref}?issue`);
      }
      return state.taskStartSent;
    },
    dismissTaskStart: async (ref) => {
      calls.dismissedTaskStarts.push(ref);
      state.taskStarts.delete(ref);
    },
    startAgentInWorktree: async (planet, number, branch, kind) => {
      calls.startedInWorktree.push([planet, number, branch, kind]);
      if (state.startedInWorktree instanceof RequestError) throw state.startedInWorktree;
      return state.startedInWorktree;
    },
    closeIssue: async (planet, number) => {
      calls.closed.push([planet, number]);
      if (state.closeFailure !== undefined) throw state.closeFailure;
      const list = state.issues.get(planet);
      if (list !== undefined && !(list instanceof RequestError) && list._tag === 'Listed') {
        state.issues.set(planet, {
          ...list,
          issues: list.issues.filter((issue) => issue.number !== number),
        });
      }
    },
    closeAgent: async (ref, force) => {
      calls.closedAgents.push([ref, force]);
      const failure = state.closeAgentFailures.shift();
      if (failure !== undefined) throw failure;
    },
    brainstorm: async () => state.brainstorm,
    sendBrainstorm: async (text, imageIds = []) => {
      await state.sendGate;
      failBrainstorm();
      calls.brainstormMessages.push(text);
      calls.brainstormImageIds.push(imageIds);
    },
    decideProposal: async (id, decision) => {
      failBrainstorm();
      calls.decisions.push([id, decision]);
    },
    resetBrainstorm: async () => {
      calls.brainstormResets += 1;
    },
    pushKey: async () => {
      calls.pushKeys += 1;
      return 'BServerKey';
    },
    subscribePush: async (subscription) => {
      const failure = state.subscribeFailure;
      state.subscribeFailure = undefined;
      if (failure !== undefined) throw failure;
      calls.subscribed.push(subscription);
    },
    unsubscribePush: async (endpoint) => {
      calls.unsubscribed.push(endpoint);
    },
    quickReplies: async () => state.quickReplies,
    saveQuickReplies: async (replies) => {
      calls.savedQuickReplies.push(replies);
      const failure = state.saveQuickRepliesFailure;
      state.saveQuickRepliesFailure = undefined;
      if (failure !== undefined) throw failure;
      state.quickReplies = replies;
      return replies;
    },
    followBrainstorm: (after, onEvent, onLive) => {
      const from = after();
      calls.brainstormFollows.push(from);
      state.brainstormLog.filter((event) => event.sequence > from).forEach(onEvent);
      brainstormFollowers.add(onEvent);
      onLive(true);
      return () => brainstormFollowers.delete(onEvent);
    },
    activity: async () => state.activity,
    followActivity: (onActivity, onLive) => {
      activityFollowers.add(onActivity);
      onLive(true);
      return () => activityFollowers.delete(onActivity);
    },
    followOverview: (onState, onLive) => {
      overviewFollowers.add(onState);
      onLive(true);
      return () => overviewFollowers.delete(onState);
    },
    followAgent: (ref, onEvent, onLive) => {
      const followers = agentFollowers.get(ref) ?? new Set();
      followers.add(onEvent);
      agentFollowers.set(ref, followers);
      onLive(true);
      return () => followers.delete(onEvent);
    },
    followSubagent: (ref, id, onEvent, onLive) => {
      const key = `${ref}/${id}`;
      const followers = subagentFollowers.get(key) ?? new Set();
      followers.add(onEvent);
      subagentFollowers.set(key, followers);
      onLive(true);
      return () => followers.delete(onEvent);
    },
  };

  return {
    client,
    state,
    calls,
    emitOverview: (next: OverviewStateView) => overviewFollowers.forEach((follow) => follow(next)),
    emitAgent: (ref: string, event: AgentEventView) =>
      agentFollowers.get(ref)?.forEach((follow) => follow(event)),
    emitSubagent: (ref: string, id: string, event: SubagentEventView) =>
      subagentFollowers.get(`${ref}/${id}`)?.forEach((follow) => follow(event)),
    /** Hands an event to the sheets that follow; an entry is also kept in the log. */
    emitBrainstorm: (event: BrainstormEventView) => {
      if (event.kind === 'entry') state.brainstormLog.push(event);
      brainstormFollowers.forEach((follow) => follow(event));
    },
    emitActivity: (next: ActivityView) => activityFollowers.forEach((follow) => follow(next)),
  };
};

/**
 * Image handling without a canvas: an image is sent as it was picked, a file named `broken.*`
 * cannot be read, one named `slow.*` takes a moment, and a thumbnail is named after the file.
 */
export const fakeImageHandling: ImageHandling = {
  prepare: async (file) => {
    if (file.name.startsWith('slow.')) await new Promise((resolve) => setTimeout(resolve, 50));
    if (file.name.startsWith('broken.')) {
      throw new UnreadableImageError(`${file.name} cannot be read as an image.`);
    }
    return file;
  },
  preview: (blob) => `blob:${blob instanceof File ? blob.name : 'image'}`,
  release: () => undefined,
};

/**
 * A device's push support as the browser would report it. `subscribe` resolves to the
 * subscription unless the owner denies, which `answer` decides.
 */
export const fakeDevicePush = (initial: DevicePushState) => {
  const device = {
    state: initial,
    answer: 'granted' as NotificationPermission,
    /** The server keys each subscribe got. */
    keys: [] as Array<string>,
  };
  const subscription: PushSubscriptionView = {
    endpoint: 'https://push.example/this-device',
    keys: { p256dh: 'p256dh', auth: 'auth' },
  };
  const push: DevicePush = {
    state: async () => device.state,
    subscribe: async (serverKey) => {
      if (device.answer !== 'granted') {
        device.state = { _tag: 'Denied' };
        return undefined;
      }
      device.keys.push(await serverKey());
      device.state = { _tag: 'Ready', subscribed: true };
      return subscription;
    },
    unsubscribe: async () => {
      device.state = { _tag: 'Ready', subscribed: false };
      return subscription.endpoint;
    },
  };
  return { device, push };
};

/**
 * Renders the whole app at `path` with `client`, through the router and a fresh query cache that
 * does not retry, so a failed request shows at once.
 */
export const renderApp = ({
  client,
  path = '/',
  devicePush = fakeDevicePush({ _tag: 'Unsupported' }).push,
  microphone = fakeMicrophone().microphone,
}: {
  readonly client: CommsClient;
  readonly path?: string;
  readonly devicePush?: DevicePush;
  readonly microphone?: Microphone;
}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter({
    client,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ImageHandlingContext.Provider value={fakeImageHandling}>
        <DevicePushContext.Provider value={devicePush}>
          <MicrophoneProvider microphone={microphone}>
            <RouterProvider router={router} />
          </MicrophoneProvider>
        </DevicePushContext.Provider>
      </ImageHandlingContext.Provider>
    </QueryClientProvider>,
  );
  return { router, queryClient };
};
