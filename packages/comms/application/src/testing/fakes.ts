import {
  type ActivityEvent,
  IN_PROGRESS_LABEL,
  OTHER_GROUP,
  parsePullRequestPath,
  parseRemote,
  type Agent,
  type ChangedFile,
  type TaskStart,
  type PullRequestRef,
  type BackgroundItem,
  type Issue,
  type Notification,
  type Project,
  type PushSubscription,
  type ConversationEntry,
  type Workspace,
  type Worktree,
} from '@pocket-comms/comms-domain';
import { AgentRuntime, type Clip, type TurnInput } from '@smotastic/pocket-agent';
import {
  layerFakeTranscriber,
  scriptedTurn,
  type ScriptStep,
} from '@smotastic/pocket-agent/testing';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as PubSub from 'effect/PubSub';
import * as Stream from 'effect/Stream';
import {
  GiteaNotConfiguredError,
  GiteaUnavailableError,
  MultiplexerRejectedError,
  IssueNotFoundError,
  PullRequestNotFoundError,
  MultiplexerUnavailableError,
  ProjectGitError,
  PushStoreError,
  QuickRepliesStoreError,
  PullRequestsStoreError,
  TaskStartsStoreError,
  ConversationUnavailableError,
} from '../errors.js';
import { ActivityStoreOutbound } from '../ports/activity-store.outbound.port.js';
import {
  BrainstormStoreOutbound,
  type StoredBrainstorm,
} from '../ports/brainstorm-store.outbound.port.js';
import { GiteaOutbound, type PullRequestInfo } from '../ports/gitea.outbound.port.js';
import { MultiplexerOutbound, type StartedAgent } from '../ports/multiplexer.outbound.port.js';
import { ImagesOutbound, type StoredImage } from '../ports/images.outbound.port.js';
import {
  SeenOutbound,
  StatusHistoryOutbound,
  type StatusMark,
} from '../ports/memory.outbound.port.js';
import { ProjectsOutbound } from '../ports/projects.outbound.port.js';
import { QuickRepliesOutbound } from '../ports/quick-replies.outbound.port.js';
import { PullRequestsOutbound, type AttachedLists } from '../ports/pull-requests.outbound.port.js';
import { TaskStartsOutbound } from '../ports/task-starts.outbound.port.js';
import {
  PushKeysOutbound,
  PushSenderOutbound,
  PushSubscriptionsOutbound,
} from '../ports/push.outbound.port.js';
import {
  ConversationOutbound,
  type SubagentMeta,
  type ConversationSource,
} from '../ports/conversation.outbound.port.js';

/** One request the fake Herdr received, so a test can prove what was sent, and what was not. */
export interface MultiplexerCall {
  readonly method:
    | 'snapshot'
    | 'readScreen'
    | 'readAgent'
    | 'prompt'
    | 'typeText'
    | 'sendKeys'
    | 'createWorktree'
    | 'openWorktree'
    | 'openShell'
    | 'removeWorktree'
    | 'startAgent';
  readonly target?: string;
  readonly params?: unknown;
}

/**
 * The state behind the fakes of the outbound ports. A test changes it directly and publishes on
 * `herdrChanges` or `conversationAppends` to drive the streams.
 */
export class FakeState extends Context.Service<
  FakeState,
  {
    agents: Array<Agent>;
    workspaces: Array<Workspace>;
    readonly screens: Map<string, string>;
    /** Session id to conversation. */
    readonly conversations: Map<
      string,
      {
        entries: Array<ConversationEntry>;
        modifiedAt: number;
        background?: ReadonlyArray<BackgroundItem>;
      }
    >;
    /** What a subagent's meta file says, by `subagentKey`. */
    readonly subagentMetas: Map<string, SubagentMeta>;
    /** Pane id to the Herdr error code that a command for it fails with. */
    readonly rejects: Map<string, string>;
    available: boolean;
    readonly calls: Array<MultiplexerCall>;
    readonly herdrChanges: PubSub.PubSub<void>;
    readonly conversationAppends: PubSub.PubSub<{
      /** The session, or a subagent's conversation by `subagentKey`. */
      readonly session: string;
      readonly entries: ReadonlyArray<ConversationEntry>;
    }>;
    readonly seen: Set<string>;
    readonly seenChanges: PubSub.PubSub<void>;
    readonly history: Map<string, StatusMark>;
    projects: Array<Project>;
    /** Every git question the fake projects port was asked, as `<method> <project> [<branch>]`. */
    readonly gitCalls: Array<string>;
    /** The default branch of every project; a project without one fails `defaultBase`. */
    readonly bases: Map<string, string>;
    /** Branches that exist, as `<project>:<branch>`. */
    readonly branches: Set<string>;
    /** Branch names git refuses. */
    readonly badBranchNames: Set<string>;
    /** What the next `startAgent` reports. */
    started: StartedAgent;
    /** The panes whose prompt Herdr takes without answering, as a timeout. */
    readonly unanswered: Set<string>;
    /** The panes whose agent Herdr does not yet report ready for input. */
    readonly unready: Set<string>;
    /** The `origin` URL of every project that has one. */
    readonly origins: Map<string, string>;
    /** The worktrees of every project. */
    readonly worktrees: Map<string, Array<Worktree>>;
    /** The worktree folders with uncommitted or untracked changes. */
    readonly changed: Set<string>;
    /** The issues and pull requests of every Gitea repository, by `<owner>/<name>`. */
    readonly issues: Map<string, Array<Issue>>;
    /** The fake Gitea has a token. */
    giteaConfigured: boolean;
    /** Why the fake Gitea fails, when it does. */
    giteaFailure: string | undefined;
    /** Why only marking an issue in progress fails, when it does. */
    giteaMarkFailure: string | undefined;
    /** The names of the images the fake Gitea refuses to attach. */
    readonly giteaRefusedImages: Set<string>;
    /** Every Gitea request, as `<method> <owner>/<name> [<number>]`. */
    /**
     * The pull requests of every Gitea repository, by `<owner>/<name>#<number>`, with their diff;
     * a diff of `undefined` is one over the limit.
     */
    readonly pullRequests: Map<
      string,
      PullRequestInfo & {
        readonly diff: string | undefined;
        readonly files: ReadonlyArray<ChangedFile>;
      }
    >;
    /** The saved attached pull requests, by session id. */
    attachedLists: AttachedLists;
    /** The kept task starts, by worktree folder. */
    readonly taskStarts: Map<string, TaskStart>;
    /** When set, the task starts file fails with this reason. */
    taskStartsFailure: string | undefined;
    /** When set, the attached pull requests file fails with this reason. */
    attachedListsFailure: string | undefined;
    /** When set, only reading the attached pull requests file fails, until the next save. */
    attachedListsLoadFailure: string | undefined;
    readonly giteaCalls: Array<string>;
    /** The top-level docs of every project, by `<project>/<file>`. */
    readonly docs: Map<string, string>;
    /** Runs before a doc is read, so a test can hold Pi's tool open. */
    readDocWait: Effect.Effect<void> | undefined;
    /** Why the runtime is not set up, when it is not. */
    notSetUp: string | undefined;
    /** The runtime's model takes images. */
    seesImages: boolean;
    /** The turns the scripted runtime plays, in order, and what it was given. */
    readonly script: Array<ReadonlyArray<ScriptStep>>;
    readonly turns: Array<TurnInput>;
    /** The stored brainstorm, and how often it was saved. */
    storedBrainstorm: StoredBrainstorm | undefined;
    saves: number;
    /** Which saves of the brainstorm die, as a broken disk would make them. */
    saveDies: ((brainstorm: StoredBrainstorm) => boolean) | undefined;
    /** The kept images by id, with when each was saved in epoch milliseconds. */
    readonly images: Map<string, StoredImage & { readonly savedAt: number }>;
    /** The kept activity events, oldest first. */
    activity: ReadonlyArray<ActivityEvent>;
    readonly activityChanges: PubSub.PubSub<void>;
    /** The subscribed devices, in the order they subscribed. */
    pushSubscriptions: Array<PushSubscription>;
    readonly pushPublicKey: string;
    /** Why the push store fails, when it does. */
    pushStoreFailure: string | undefined;
    /** Why only removing a device fails, when it does. */
    pushRemoveFailure: string | undefined;
    /** Every push sent, with when it was sent in epoch milliseconds. */
    readonly pushes: Array<{
      readonly endpoint: string;
      readonly notification: Notification;
      readonly at: number;
    }>;
    /** The endpoints whose push service answers that the subscription is gone. */
    readonly goneEndpoints: Set<string>;
    /** The owner's saved quick replies, none until saved. */
    quickReplies: ReadonlyArray<string> | undefined;
    /** Why the quick replies store fails, when it does. */
    quickRepliesFailure: string | undefined;
    /** The speech service: whether it is set up, what it hears, why it fails and the voice messages it got (`clips`, as the agent package names them). */
    readonly speech: {
      available: boolean;
      text: string;
      failure: string | undefined;
      readonly clips: Array<Clip>;
    };
  }
>()('comms/application/testing/FakeState') {}

export const fakeWorkspaces: ReadonlyArray<Workspace> = [
  {
    id: 'w1',
    label: 'app',
    group: { key: '/work/app/.git', name: 'app' },
    root: '/work/app',
    project: 'app',
    checkout: '/work/app',
  },
  {
    id: 'w2',
    label: 'feature',
    group: { key: '/work/app/.git', name: 'app' },
    root: '/work/app',
    project: 'app',
    worktree: 'feature',
    checkout: '/worktrees/feature',
  },
  { id: 'w3', label: 'notes', group: OTHER_GROUP },
];

/** An agent with plain defaults: an idle, named Claude agent in workspace `w1`. */
export const fakeAgent = (overrides: Partial<Agent> & Pick<Agent, 'paneId'>): Agent => ({
  name: undefined,
  kind: 'claude',
  status: 'idle',
  title: 'A task',
  workspaceId: 'w1',
  cwd: '/work/app',
  session: undefined,
  completion: undefined,
  ...overrides,
});

const herdr = (state: FakeState['Service']) => {
  const command = <A>(
    call: MultiplexerCall,
    result: () => A,
  ): Effect.Effect<A, MultiplexerUnavailableError | MultiplexerRejectedError> =>
    Effect.gen(function* () {
      state.calls.push(call);
      if (!state.available) {
        return yield* new MultiplexerUnavailableError({ reason: 'connect ENOENT herdr.sock' });
      }
      const code = call.target === undefined ? undefined : state.rejects.get(call.target);
      if (code !== undefined && call.target !== undefined) {
        return yield* new MultiplexerRejectedError({
          ref: call.target,
          code,
          message: `Herdr said ${code}.`,
        });
      }
      return result();
    });
  return MultiplexerOutbound.of({
    // A snapshot names no agent, so Herdr never refuses it.
    snapshot: command({ method: 'snapshot' }, () => ({
      agents: [...state.agents],
      workspaces: [...state.workspaces],
    })).pipe(Effect.catchTag('MultiplexerRejectedError', Effect.die)),
    readScreen: (target) =>
      command({ method: 'readScreen', target }, () => state.screens.get(target) ?? ''),
    // An agent of `agents`, by pane id or name; none answers as Herdr does.
    readAgent: (target) =>
      command({ method: 'readAgent', target }, () =>
        state.agents.find((agent) => agent.paneId === target || agent.name === target),
      ).pipe(
        Effect.flatMap((agent) =>
          agent === undefined
            ? Effect.fail(
                new MultiplexerRejectedError({
                  ref: target,
                  code: 'agent_not_found',
                  message: `agent ${target} not found`,
                }),
              )
            : Effect.succeed({
                status: agent.status,
                ready: !state.unready.has(agent.paneId),
              }),
        ),
      ),
    prompt: (target, text) =>
      command({ method: 'prompt', target, params: text }, () => undefined).pipe(
        Effect.andThen(
          state.unanswered.has(target)
            ? Effect.fail(
                new MultiplexerUnavailableError({ reason: 'Herdr did not answer in time.' }),
              )
            : Effect.void,
        ),
      ),
    typeText: (paneId, text) =>
      command({ method: 'typeText', target: paneId, params: text }, () => undefined),
    sendKeys: (target, keys) =>
      command({ method: 'sendKeys', target, params: keys }, () => undefined),
    // A new worktree's workspace is `w-<branch>` and its root pane `w-<branch>:p1`.
    createWorktree: (request) =>
      command({ method: 'createWorktree', target: request.branch, params: request }, () => ({
        workspaceId: `w-${request.branch}`,
        paneId: `w-${request.branch}:p1`,
        path: `/worktrees/${request.branch.replaceAll('/', '-')}`,
        branch: request.branch,
      })),
    // A worktree opens as the workspace that already has its checkout, else as `w-<folder>`.
    openWorktree: (opening) =>
      command({ method: 'openWorktree', target: opening.path, params: opening }, () => {
        const open = state.workspaces.find((workspace) => workspace.checkout === opening.path);
        const workspaceId = open?.id ?? `w-${opening.path}`;
        return { workspaceId, paneId: `${workspaceId}:p1`, alreadyOpen: open !== undefined };
      }),
    // Every new shell is the workspace's pane `p9`.
    openShell: (workspaceId) =>
      command({ method: 'openShell', target: workspaceId }, () => ({
        workspaceId,
        paneId: `${workspaceId}:p9`,
      })),
    removeWorktree: (removal) =>
      command(
        { method: 'removeWorktree', target: removal.workspaceId, params: removal },
        () => undefined,
      ),
    startAgent: (start) =>
      command({ method: 'startAgent', target: start.paneId, params: start }, () => state.started),
    changes: Stream.fromPubSub(state.herdrChanges),
  });
};

/** The key of a subagent's conversation in the fake's conversations and its meta files. */
export const subagentKey = (session: string, subagent: string) =>
  `${session}/subagents/${subagent}`;

const keyOf = (source: ConversationSource) =>
  source.subagent === undefined ? source.session : subagentKey(source.session, source.subagent);

const conversations = (state: FakeState['Service']) => {
  const find = (source: ConversationSource) =>
    Option.fromNullishOr(state.conversations.get(keyOf(source)));
  return ConversationOutbound.of({
    read: (source) =>
      Effect.suspend(() =>
        Option.match(find(source), {
          onNone: () =>
            Effect.fail(
              new ConversationUnavailableError({ ref: source.ref, reason: 'No session file.' }),
            ),
          onSome: (conversation) =>
            Effect.succeed({
              entries: [...conversation.entries],
              modifiedAt: conversation.modifiedAt,
            }),
        }),
      ),
    follow: (source) =>
      Stream.concat(
        Stream.sync(() => state.conversations.get(keyOf(source))?.entries ?? []),
        Stream.fromPubSub(state.conversationAppends).pipe(
          Stream.filter((append) => append.session === keyOf(source)),
          Stream.map((append) => append.entries),
        ),
      ),
    modifiedAt: (source) =>
      Effect.sync(() => Option.map(find(source), (conversation) => conversation.modifiedAt)),
    background: (source) =>
      Effect.suspend(() =>
        Option.match(find(source), {
          onNone: () =>
            Effect.fail(
              new ConversationUnavailableError({ ref: source.ref, reason: 'No session file.' }),
            ),
          onSome: (conversation) => Effect.succeed(conversation.background ?? []),
        }),
      ),
    subagentMeta: (source) =>
      Effect.sync(() => Option.fromNullishOr(state.subagentMetas.get(keyOf(source)))),
  });
};

const projects = (state: FakeState['Service']) => {
  const ask = (call: string) => Effect.sync(() => void state.gitCalls.push(call));
  return ProjectsOutbound.of({
    list: Effect.sync(() => [...state.projects]),
    isValidBranchName: (project, branch) =>
      Effect.as(
        ask(`isValidBranchName ${project.name} ${branch}`),
        !state.badBranchNames.has(branch),
      ),
    defaultBase: (project) =>
      Effect.flatMap(ask(`defaultBase ${project.name}`), () => {
        const base = state.bases.get(project.name);
        return base === undefined
          ? Effect.fail(new ProjectGitError({ project: project.name, reason: 'fetch failed' }))
          : Effect.succeed(base);
      }),
    originUrl: (project) =>
      Effect.as(
        ask(`originUrl ${project.name}`),
        Option.fromNullishOr(state.origins.get(project.name)),
      ),
    worktrees: (project) =>
      Effect.as(ask(`worktrees ${project.name}`), [...(state.worktrees.get(project.name) ?? [])]),
    readDoc: (project, doc) =>
      Effect.map(state.readDocWait ?? Effect.void, () =>
        Option.fromNullishOr(state.docs.get(`${project.name}/${doc}`)),
      ),
    hasChanges: (project, path) =>
      Effect.as(ask(`hasChanges ${project.name} ${path}`), state.changed.has(path)),
    branchExists: (project, branch) =>
      Effect.as(
        ask(`branchExists ${project.name} ${branch}`),
        state.branches.has(`${project.name}:${branch}`),
      ),
  });
};

// The fake Gitea is the host `gitea`, at `http://gitea.test`.
/** The folder of the fake image store. */
export const FAKE_IMAGES_FOLDER = '/state/images';

/** A device's subscription whose endpoint ends in `name`. */
export const fakeSubscription = (name: string): PushSubscription => ({
  endpoint: `https://push.example/${name}`,
  keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` },
});

const pushStore = <A>(state: FakeState['Service'], result: () => A) =>
  state.pushStoreFailure === undefined
    ? Effect.sync(result)
    : Effect.fail(new PushStoreError({ reason: state.pushStoreFailure }));

const taskStartsStore = <A>(state: FakeState['Service'], result: () => A) =>
  state.taskStartsFailure === undefined
    ? Effect.sync(result)
    : Effect.fail(new TaskStartsStoreError({ reason: state.taskStartsFailure }));

const pushSubscriptions = (state: FakeState['Service']): PushSubscriptionsOutbound['Service'] => ({
  list: Effect.suspend(() => pushStore(state, () => [...state.pushSubscriptions])),
  save: (subscription) =>
    Effect.suspend(() =>
      pushStore(state, () => {
        const others = state.pushSubscriptions.filter(
          (kept) => kept.endpoint !== subscription.endpoint,
        );
        state.pushSubscriptions = [...others, subscription];
      }),
    ),
  remove: (endpoint) =>
    Effect.suspend(() =>
      state.pushRemoveFailure !== undefined
        ? Effect.fail(new PushStoreError({ reason: state.pushRemoveFailure }))
        : pushStore(state, () => {
            state.pushSubscriptions = state.pushSubscriptions.filter(
              (kept) => kept.endpoint !== endpoint,
            );
          }),
    ),
});

// Ids count up, padded to the store's id shape.
const images = (state: FakeState['Service']): ImagesOutbound['Service'] => ({
  folder: FAKE_IMAGES_FOLDER,
  save: (image) =>
    Effect.gen(function* () {
      const id = `image${'a'.repeat(20)}${String.fromCharCode(97 + state.images.size)}`;
      state.images.set(id, { ...image, savedAt: yield* Clock.currentTimeMillis });
      return id;
    }),
  path: (id) =>
    Effect.sync(() => {
      const image = state.images.get(id);
      return image === undefined
        ? Option.none()
        : Option.some(`${FAKE_IMAGES_FOLDER}/${id}.${image.kind === 'png' ? 'png' : 'jpg'}`);
    }),
  read: (id) =>
    Effect.sync(() =>
      Option.map(Option.fromNullishOr(state.images.get(id)), ({ kind, bytes }) => ({
        kind,
        bytes,
      })),
    ),
  removeOlderThan: (epochMillis) =>
    Effect.sync(() => {
      let removed = 0;
      for (const [id, image] of state.images) {
        if (image.savedAt < epochMillis) {
          state.images.delete(id);
          removed += 1;
        }
      }
      return removed;
    }),
});

const gitea = (state: FakeState['Service']) => {
  const request = <A, E = never>(
    call: string,
    result: () => Effect.Effect<A, E>,
  ): Effect.Effect<A, E | GiteaNotConfiguredError | GiteaUnavailableError> =>
    Effect.suspend((): Effect.Effect<A, E | GiteaNotConfiguredError | GiteaUnavailableError> => {
      if (!state.giteaConfigured) return Effect.fail(new GiteaNotConfiguredError());
      state.giteaCalls.push(call);
      return state.giteaFailure === undefined
        ? result()
        : Effect.fail(new GiteaUnavailableError({ reason: state.giteaFailure }));
    });
  return GiteaOutbound.of({
    repositoryOf: (remoteUrl) => {
      const remote = parseRemote(remoteUrl);
      return remote?.host === 'gitea'
        ? Option.some({
            owner: remote.owner,
            name: remote.name,
            url: `http://gitea.test/${remote.owner}/${remote.name}`,
          })
        : Option.none();
    },
    openIssues: ({ owner, name }) =>
      request(`openIssues ${owner}/${name}`, () =>
        Effect.succeed([...(state.issues.get(`${owner}/${name}`) ?? [])]),
      ),
    issue: ({ owner, name }, number) =>
      request(`issue ${owner}/${name} ${number}`, () => {
        const found = state.issues
          .get(`${owner}/${name}`)
          ?.find((issue) => issue.number === number);
        return found === undefined
          ? Effect.fail(new IssueNotFoundError({ number }))
          : Effect.succeed<Issue>(found);
      }),
    closeIssue: ({ owner, name }, number) =>
      request(`closeIssue ${owner}/${name} ${number}`, () => {
        const issues = state.issues.get(`${owner}/${name}`) ?? [];
        const index = issues.findIndex((issue) => issue.number === number);
        const found = issues[index];
        if (found === undefined) return Effect.fail(new IssueNotFoundError({ number }));
        issues[index] = { ...found, state: 'closed' };
        return Effect.void;
      }),
    markInProgress: ({ owner, name }, number) =>
      request<void, IssueNotFoundError | GiteaUnavailableError>(
        `markInProgress ${owner}/${name} ${number}`,
        () => {
          if (state.giteaMarkFailure !== undefined) {
            return Effect.fail(new GiteaUnavailableError({ reason: state.giteaMarkFailure }));
          }
          const issues = state.issues.get(`${owner}/${name}`) ?? [];
          const index = issues.findIndex((issue) => issue.number === number);
          const found = issues[index];
          if (found === undefined) return Effect.fail(new IssueNotFoundError({ number }));
          issues[index] = { ...found, labels: [...found.labels, IN_PROGRESS_LABEL] };
          return Effect.void;
        },
      ),
    createIssue: ({ owner, name }, { title, body }) =>
      request(`createIssue ${owner}/${name} ${JSON.stringify({ title, body })}`, () =>
        Effect.sync(() => {
          const key = `${owner}/${name}`;
          const issues = state.issues.get(key) ?? [];
          const number = Math.max(0, ...issues.map((issue) => issue.number)) + 1;
          const url = `http://gitea.test/${key}/issues/${number}`;
          state.issues.set(key, [
            ...issues,
            { number, title, body, labels: [], updatedAt: 0, url, state: 'open', pull: false },
          ]);
          return { number, url };
        }),
      ),
    updateIssue: ({ owner, name }, number, { title, body }) =>
      request(`updateIssue ${owner}/${name} ${number} ${JSON.stringify({ title, body })}`, () => {
        const issues = state.issues.get(`${owner}/${name}`) ?? [];
        const index = issues.findIndex((issue) => issue.number === number);
        const found = issues[index];
        if (found === undefined) return Effect.fail(new IssueNotFoundError({ number }));
        issues[index] = { ...found, title, body };
        return Effect.void;
      }),
    pullRequestOf: (address) => {
      if (!URL.canParse(address)) return { _tag: 'NotAPullRequest' };
      const url = new URL(address);
      if (url.hostname !== 'gitea.test') return { _tag: 'OtherHost' };
      return Option.match(parsePullRequestPath(url.pathname), {
        onNone: () => ({ _tag: 'NotAPullRequest' }) as const,
        onSome: (ref) => ({ _tag: 'PullRequest', ref }) as const,
      });
    },
    pullRequest: (ref) =>
      request(`pullRequest ${pullRequestKey(ref)}`, () => {
        const found = state.pullRequests.get(pullRequestKey(ref));
        return found === undefined
          ? Effect.fail(new PullRequestNotFoundError(ref))
          : Effect.succeed<PullRequestInfo>({
              title: found.title,
              state: found.state,
              url: found.url,
            });
      }),
    pullRequestDiff: (ref) =>
      request(`pullRequestDiff ${pullRequestKey(ref)}`, () => {
        const found = state.pullRequests.get(pullRequestKey(ref));
        return found === undefined
          ? Effect.fail(new PullRequestNotFoundError(ref))
          : Effect.succeed(Option.fromNullishOr(found.diff));
      }),
    pullRequestFiles: (ref) =>
      request(`pullRequestFiles ${pullRequestKey(ref)}`, () => {
        const found = state.pullRequests.get(pullRequestKey(ref));
        return found === undefined
          ? Effect.fail(new PullRequestNotFoundError(ref))
          : Effect.succeed(found.files);
      }),
    attachImage: ({ owner, name }, number, image) =>
      request<string, IssueNotFoundError | GiteaUnavailableError>(
        `attachImage ${owner}/${name} ${number} ${image.name}`,
        () => {
          if (state.giteaRefusedImages.has(image.name)) {
            return Effect.fail(
              new GiteaUnavailableError({ reason: `Gitea refused ${image.name} (422).` }),
            );
          }
          const found = state.issues
            .get(`${owner}/${name}`)
            ?.some((issue) => issue.number === number);
          return found === true
            ? Effect.succeed(`http://gitea.test/attachments/${number}/${image.name}`)
            : Effect.fail(new IssueNotFoundError({ number }));
        },
      ),
  });
};

/** How the fakes key a pull request: `<owner>/<name>#<number>`. */
export const pullRequestKey = ({ owner, name, number }: PullRequestRef): string =>
  `${owner}/${name}#${number}`;

/** An open issue of `owner/app` with plain defaults. */
export const fakeIssue = (overrides: Partial<Issue> & Pick<Issue, 'number'>): Issue => ({
  title: `Issue ${overrides.number}`,
  body: '',
  labels: [],
  updatedAt: 0,
  url: `http://gitea.test/owner/app/issues/${overrides.number}`,
  state: 'open',
  pull: false,
  ...overrides,
});

/** Every outbound port as a fake, plus `FakeState` to arrange and inspect them. */
export const fakeLayer = () => {
  const state = Layer.effect(
    FakeState,
    Effect.gen(function* () {
      return {
        agents: [],
        workspaces: [...fakeWorkspaces],
        screens: new Map(),
        conversations: new Map(),
        subagentMetas: new Map(),
        rejects: new Map(),
        available: true,
        calls: [],
        herdrChanges: yield* PubSub.unbounded<void>(),
        conversationAppends: yield* PubSub.unbounded<{
          readonly session: string;
          readonly entries: ReadonlyArray<ConversationEntry>;
        }>(),
        seen: new Set(),
        seenChanges: yield* PubSub.unbounded<void>(),
        history: new Map(),
        projects: [{ name: 'app', path: '/work/app' }],
        gitCalls: [],
        bases: new Map([['app', 'origin/master']]),
        branches: new Set(),
        badBranchNames: new Set(),
        started: { status: 'idle', ready: true },
        unready: new Set(),
        unanswered: new Set(),
        origins: new Map([['app', 'gitea:owner/app.git']]),
        worktrees: new Map([['app', [{ path: '/work/app', branch: 'master' }]]]),
        changed: new Set(),
        issues: new Map(),
        giteaConfigured: true,
        giteaFailure: undefined,
        giteaMarkFailure: undefined,
        giteaRefusedImages: new Set(),
        giteaCalls: [],
        pullRequests: new Map(),
        attachedLists: {},
        taskStarts: new Map(),
        taskStartsFailure: undefined,
        attachedListsFailure: undefined,
        attachedListsLoadFailure: undefined,
        docs: new Map(),
        readDocWait: undefined,
        notSetUp: undefined,
        seesImages: true,
        script: [],
        turns: [],
        storedBrainstorm: undefined,
        saves: 0,
        saveDies: undefined,
        images: new Map(),
        activity: [],
        activityChanges: yield* PubSub.unbounded<void>(),
        pushSubscriptions: [],
        pushPublicKey: 'BFakePublicKey',
        pushStoreFailure: undefined,
        pushRemoveFailure: undefined,
        pushes: [],
        goneEndpoints: new Set(),
        quickReplies: undefined,
        quickRepliesFailure: undefined,
        speech: { available: true, text: '', failure: undefined, clips: [] },
      };
    }),
  );
  const ports = Layer.effectContext(
    Effect.gen(function* () {
      const fake = yield* FakeState;
      return Context.make(MultiplexerOutbound, herdr(fake)).pipe(
        Context.add(ConversationOutbound, conversations(fake)),
        Context.add(ProjectsOutbound, projects(fake)),
        Context.add(GiteaOutbound, gitea(fake)),
        Context.add(AgentRuntime, {
          get notSetUp() {
            return Option.fromNullishOr(fake.notSetUp);
          },
          get seesImages() {
            return fake.seesImages;
          },
          runTurn: (turn) => scriptedTurn({ turns: fake.script, received: fake.turns }, turn),
        }),
        Context.add(BrainstormStoreOutbound, {
          load: Effect.sync(() => Option.fromNullishOr(fake.storedBrainstorm)),
          save: (brainstorm) =>
            fake.saveDies?.(brainstorm) === true
              ? Effect.die('The disk is full.')
              : Effect.sync(() => {
                  fake.storedBrainstorm = brainstorm;
                  fake.saves += 1;
                }),
        }),
        Context.add(ImagesOutbound, images(fake)),
        Context.add(ActivityStoreOutbound, {
          events: Effect.sync(() => fake.activity),
          update: (change) =>
            Effect.suspend(() => {
              fake.activity = change(fake.activity);
              return PubSub.publish(fake.activityChanges, undefined);
            }).pipe(Effect.asVoid),
          changes: Stream.fromPubSub(fake.activityChanges),
        }),
        Context.add(PushSubscriptionsOutbound, pushSubscriptions(fake)),
        Context.add(PushKeysOutbound, {
          publicKey: Effect.suspend(() => pushStore(fake, () => fake.pushPublicKey)),
        }),
        Context.add(PushSenderOutbound, {
          send: (subscription, notification) =>
            Effect.gen(function* () {
              if (fake.goneEndpoints.has(subscription.endpoint)) return 'gone' as const;
              const at = yield* Clock.currentTimeMillis;
              fake.pushes.push({ endpoint: subscription.endpoint, notification, at });
              return 'sent' as const;
            }),
        }),
        Context.add(TaskStartsOutbound, {
          load: Effect.suspend(() => taskStartsStore(fake, () => [...fake.taskStarts.values()])),
          put: (start) =>
            Effect.suspend(() =>
              taskStartsStore(fake, () => void fake.taskStarts.set(start.folder, start)),
            ),
          forget: (folder) =>
            Effect.suspend(() => taskStartsStore(fake, () => void fake.taskStarts.delete(folder))),
        }),
        Context.add(PullRequestsOutbound, {
          load: Effect.suspend(() => {
            const reason = fake.attachedListsFailure ?? fake.attachedListsLoadFailure;
            return reason === undefined
              ? Effect.succeed(fake.attachedLists)
              : Effect.fail(new PullRequestsStoreError({ reason }));
          }),
          save: (lists) =>
            Effect.suspend(() =>
              fake.attachedListsFailure === undefined
                ? Effect.sync(() => {
                    fake.attachedLists = lists;
                    fake.attachedListsLoadFailure = undefined;
                  })
                : Effect.fail(new PullRequestsStoreError({ reason: fake.attachedListsFailure })),
            ),
        }),
        Context.add(QuickRepliesOutbound, {
          load: Effect.suspend(() =>
            fake.quickRepliesFailure === undefined
              ? Effect.succeed(Option.fromNullishOr(fake.quickReplies))
              : Effect.fail(new QuickRepliesStoreError({ reason: fake.quickRepliesFailure })),
          ),
          save: (replies) =>
            Effect.suspend(() =>
              fake.quickRepliesFailure === undefined
                ? Effect.sync(() => void (fake.quickReplies = replies))
                : Effect.fail(new QuickRepliesStoreError({ reason: fake.quickRepliesFailure })),
            ),
        }),
        Context.add(SeenOutbound, {
          seen: Effect.sync(() => new Set(fake.seen)),
          markSeen: (key) =>
            Effect.suspend(() => {
              fake.seen.add(key);
              return PubSub.publish(fake.seenChanges, undefined);
            }).pipe(Effect.asVoid),
          changes: Stream.fromPubSub(fake.seenChanges),
        }),
        Context.add(StatusHistoryOutbound, {
          get: (paneId) => Effect.sync(() => Option.fromNullishOr(fake.history.get(paneId))),
          set: (paneId, mark) => Effect.sync(() => void fake.history.set(paneId, mark)),
        }),
      );
    }),
  );
  const transcriber = Layer.unwrap(
    Effect.gen(function* () {
      const fake = yield* FakeState;
      return layerFakeTranscriber(fake.speech);
    }),
  );
  return Layer.provideMerge(Layer.mergeAll(ports, transcriber), state);
};
