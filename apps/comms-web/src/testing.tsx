import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { configure, render } from '@testing-library/react';
import {
  RequestError,
  type ActivityView,
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
  type ProjectView,
  type ProposalDecision,
  type SubagentEventView,
  type SubagentView,
  type TaskCreatedView,
  type TranscriptView,
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
  project: 'app',
  changedAt: Date.now() - 60_000,
  needsYou: false,
  background: [],
  ...overrides,
});

export interface FakeState {
  overview: OverviewView;
  readonly agents: Map<string, AgentView>;
  readonly transcripts: Map<string, TranscriptView>;
  /** The subagents of each agent, by `<ref>/<id>`. */
  readonly subagents: Map<string, SubagentView>;
  readonly screens: Map<string, string>;
  /** A failure for the next prompt, as the server would report it. */
  promptFailure?: string;
  /** A failure for the next image upload. */
  uploadFailure?: string;
  projects: ReadonlyArray<ProjectView>;
  /** What the next task creation answers: the created worktree, or a failure. */
  created: TaskCreatedView | RequestError;
  /** Each project's issues, or a failure; a project without an entry has no Gitea remote. */
  readonly issues: Map<string, IssueListView | RequestError>;
  /** What the next Implement with Claude answers. */
  implemented: IssueTaskCreatedView | RequestError;
  /** A failure for the next close; without one the issue leaves its project's list. */
  closeFailure?: RequestError;
  /** The failures of the next agent closes, in order; a close without one succeeds. */
  closeAgentFailures: Array<RequestError>;
  /** The brainstorm chat as the server holds it. */
  brainstorm: BrainstormStateView;
  /** A failure for the next brainstorm message or decision, as the server would report it. */
  brainstormFailure?: RequestError;
  /** The activity timeline as the server holds it, newest first. */
  activity: ActivityView;
  /** A failure for the next push subscription. */
  subscribeFailure?: RequestError;
}

/**
 * A stand-in for the API that records every command. `emitOverview`, `emitAgent`,
 * `emitBrainstorm` and `emitActivity` push live events to the screens that follow them.
 */
export const fakeClient = (initial: Partial<FakeState> = {}) => {
  const state: FakeState = {
    overview: { needsYou: [], groups: [] },
    agents: new Map(),
    transcripts: new Map(),
    subagents: new Map(),
    screens: new Map(),
    projects: [
      { name: 'pocket-comms', open: true },
      { name: 'pocket-home', open: false },
    ],
    created: { workspace: 'wK', branch: 'feat/x', path: '/worktrees/feat-x' },
    issues: new Map(),
    implemented: { workspace: 'wK', branch: 'feat/1-x', path: '/worktrees/feat-1-x' },
    closeAgentFailures: [],
    brainstorm: { _tag: 'Ready', entries: [], answering: false, live: '' },
    activity: { events: [] },
    ...initial,
  };
  const calls = {
    prompts: [] as Array<[string, string]>,
    /** The image ids of each prompt, in the order of `prompts`. */
    promptImages: [] as Array<ReadonlyArray<string>>,
    uploads: [] as Array<Blob>,
    keys: [] as Array<[string, ReadonlyArray<Key>]>,
    seen: [] as Array<string>,
    tasks: [] as Array<NewTask>,
    implemented: [] as Array<[string, number, string, string?]>,
    closed: [] as Array<[string, number]>,
    closedAgents: [] as Array<[string, boolean]>,
    brainstormMessages: [] as Array<string>,
    decisions: [] as Array<[string, ProposalDecision]>,
    brainstormResets: 0,
    pushKeys: 0,
    subscribed: [] as Array<PushSubscriptionView>,
    unsubscribed: [] as Array<string>,
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

  const client: CommsClient = {
    overview: async () => state.overview,
    agent: async (ref) => find(ref),
    transcript: async (ref) => state.transcripts.get(ref) ?? { entries: [], activity: 'Thinking…' },
    subagent: async (ref, id) => {
      const subagent = state.subagents.get(`${ref}/${id}`);
      if (subagent === undefined) throw new RequestError(`${ref} has no subagent ${id}.`, 404);
      return subagent;
    },
    screen: async (ref) => state.screens.get(ref) ?? '',
    prompt: async (ref, text, imageIds = []) => {
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
    keys: async (ref, keys) => {
      calls.keys.push([ref, keys]);
    },
    seen: async (ref) => {
      calls.seen.push(ref);
    },
    projects: async () => state.projects,
    createTask: async (task) => {
      calls.tasks.push(task);
      if (state.created instanceof RequestError) throw state.created;
      return state.created;
    },
    issues: async (project) => {
      const list = state.issues.get(project) ?? { _tag: 'NoGiteaRemote' };
      if (list instanceof RequestError) throw list;
      return list;
    },
    implementIssue: async (project, number, branch, additionalInformation) => {
      calls.implemented.push(
        additionalInformation === undefined
          ? [project, number, branch]
          : [project, number, branch, additionalInformation],
      );
      if (state.implemented instanceof RequestError) throw state.implemented;
      return state.implemented;
    },
    closeIssue: async (project, number) => {
      calls.closed.push([project, number]);
      if (state.closeFailure !== undefined) throw state.closeFailure;
      const list = state.issues.get(project);
      if (list !== undefined && !(list instanceof RequestError) && list._tag === 'Listed') {
        state.issues.set(project, {
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
    sendBrainstorm: async (text) => {
      failBrainstorm();
      calls.brainstormMessages.push(text);
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
    followBrainstorm: (onEvent, onLive) => {
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
    emitBrainstorm: (event: BrainstormEventView) =>
      brainstormFollowers.forEach((follow) => follow(event)),
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
}: {
  readonly client: CommsClient;
  readonly path?: string;
  readonly devicePush?: DevicePush;
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
          <RouterProvider router={router} />
        </DevicePushContext.Provider>
      </ImageHandlingContext.Provider>
    </QueryClientProvider>,
  );
  return { router, queryClient };
};
