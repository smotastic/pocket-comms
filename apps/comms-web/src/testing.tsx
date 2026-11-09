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
import { MicrophoneContext, MicrophoneError, type Microphone } from './voice.js';

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
  /** A failure for the next typed text. */
  typeFailure?: string;
  /** Holds typed text on its way until it resolves, such as to see the page meanwhile. */
  typeGate?: Promise<void>;
  /** A failure for the next image upload. */
  uploadFailure?: string;
  /** Whether the server transcribes voice clips. */
  speechAvailable: boolean;
  /** What the next voice clip is transcribed to, or a failure. */
  transcription: string | RequestError;
  /** Holds a transcription on its way until it resolves, such as to see the wait. */
  transcriptionGate?: Promise<void>;
  /** Holds a prompt on its way until it resolves. */
  promptGate?: Promise<void>;
  /** Holds a brainstorm message on its way until it resolves. */
  sendGate?: Promise<void>;
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
  /** The brainstorm chat's state as the server holds it. */
  brainstorm: BrainstormStateView;
  /** The brainstorm chat's entries, numbered from 1, which a sheet that follows gets first. */
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
    speechAvailable: false,
    transcription: 'dark mode for pocket-home',
    brainstorm: {
      _tag: 'Ready',
      answering: false,
      seesPictures: true,
      pictures: [],
      voice: false,
    },
    brainstormLog: [],
    activity: { events: [] },
    quickReplies: ['Go ahead', 'Commit and open a PR'],
    ...initial,
  };
  const calls = {
    prompts: [] as Array<[string, string]>,
    /** The image ids of each prompt, in the order of `prompts`. */
    promptImages: [] as Array<ReadonlyArray<string>>,
    uploads: [] as Array<Blob>,
    /** How often the app asked whether the server transcribes. */
    speechAsked: 0,
    /** The voice clips sent for transcription. */
    clips: [] as Array<Blob>,
    keys: [] as Array<[string, ReadonlyArray<Key>]>,
    typed: [] as Array<[string, string]>,
    seen: [] as Array<string>,
    tasks: [] as Array<NewTask>,
    implemented: [] as Array<[string, number, string, string?]>,
    closed: [] as Array<[string, number]>,
    closedAgents: [] as Array<[string, boolean]>,
    brainstormMessages: [] as Array<string>,
    /** The image ids of each brainstorm message, in the order of `brainstormMessages`. */
    brainstormImageIds: [] as Array<ReadonlyArray<string>>,
    decisions: [] as Array<[string, ProposalDecision]>,
    brainstormResets: 0,
    /** Where each follow of the brainstorm chat started: the `after` it asked for. */
    brainstormFollows: [] as Array<number>,
    pushKeys: 0,
    subscribed: [] as Array<PushSubscriptionView>,
    unsubscribed: [] as Array<string>,
    savedQuickReplies: [] as Array<ReadonlyArray<string>>,
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
    transcribe: async (clip) => {
      calls.clips.push(clip);
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
 * A microphone as the browser would offer it. `answer` decides whether the owner allows it;
 * `recording` says whether it is taken right now.
 */
export const fakeMicrophone = () => {
  let ended: (() => void) | undefined;
  const device = {
    answer: 'granted' as 'granted' | 'denied',
    recording: false,
    /** How many recordings have started. */
    started: 0,
    /** Records nothing, as a tap too short for any sound. */
    silent: false,
    /** Ends the recording by itself, as when a call takes the microphone. */
    end: () => {
      device.recording = false;
      ended?.();
    },
  };
  const microphone: Microphone = {
    start: async (onEnded) => {
      if (device.answer !== 'granted') {
        throw new MicrophoneError(
          'The microphone is not allowed. Allow it in the browser to record.',
        );
      }
      ended = onEnded;
      device.recording = true;
      device.started += 1;
      const clip = new Blob(device.silent ? [] : [`clip ${device.started}`], {
        type: 'audio/mp4',
      });
      return {
        stop: async () => {
          device.recording = false;
          return clip;
        },
      };
    },
  };
  return { device, microphone };
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
          <MicrophoneContext.Provider value={microphone}>
            <RouterProvider router={router} />
          </MicrophoneContext.Provider>
        </DevicePushContext.Provider>
      </ImageHandlingContext.Provider>
    </QueryClientProvider>,
  );
  return { router, queryClient };
};
