import {
  IN_PROGRESS_LABEL,
  OTHER_GROUP,
  parseRemote,
  type Agent,
  type Issue,
  type Notification,
  type Project,
  type PushSubscription,
  type TranscriptEntry,
  type Workspace,
  type Worktree,
} from '@pocket-comms/comms-domain';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as PubSub from 'effect/PubSub';
import type * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import {
  AgentRuntimeError,
  GiteaNotConfiguredError,
  GiteaUnavailableError,
  HerdrRejectedError,
  IssueNotFoundError,
  HerdrUnavailableError,
  ProjectGitError,
  PushStoreError,
  TranscriptUnavailableError,
} from '../errors.js';
import {
  AgentRuntimeOutbound,
  type RuntimeEvent,
  type TurnInput,
} from '../ports/agent-runtime.outbound.port.js';
import {
  BrainstormStoreOutbound,
  type StoredChat,
} from '../ports/brainstorm-store.outbound.port.js';
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { HerdrOutbound, type StartedAgent } from '../ports/herdr.outbound.port.js';
import { ImagesOutbound, type StoredImage } from '../ports/images.outbound.port.js';
import {
  SeenOutbound,
  StatusHistoryOutbound,
  type StatusMark,
} from '../ports/memory.outbound.port.js';
import { ProjectsOutbound } from '../ports/projects.outbound.port.js';
import {
  PushKeysOutbound,
  PushSenderOutbound,
  PushSubscriptionsOutbound,
} from '../ports/push.outbound.port.js';
import { TranscriptOutbound, type TranscriptSource } from '../ports/transcript.outbound.port.js';

/** One request the fake Herdr received, so a test can prove what was sent, and what was not. */
export interface HerdrCall {
  readonly method:
    | 'snapshot'
    | 'readScreen'
    | 'prompt'
    | 'sendKeys'
    | 'createWorktree'
    | 'removeWorktree'
    | 'startAgent';
  readonly target?: string;
  readonly params?: unknown;
}

/** One step of a scripted turn of the agent runtime. */
export type ScriptStep =
  | { readonly text: string }
  /** Waits for the effect before the next step, so a test can hold a turn open. */
  | { readonly until: Effect.Effect<void> }
  | { readonly tool: string; readonly input: unknown }
  | { readonly fail: string }
  /** A defect, as an adapter bug would raise. */
  | { readonly die: string };

/**
 * The state behind the fakes of the outbound ports. A test changes it directly and publishes on
 * `herdrChanges` or `transcriptAppends` to drive the streams.
 */
export class FakeState extends Context.Service<
  FakeState,
  {
    agents: Array<Agent>;
    workspaces: Array<Workspace>;
    readonly screens: Map<string, string>;
    /** Session id to transcript. */
    readonly transcripts: Map<string, { entries: Array<TranscriptEntry>; modifiedAt: number }>;
    /** Pane id to the Herdr error code that a command for it fails with. */
    readonly rejects: Map<string, string>;
    available: boolean;
    readonly calls: Array<HerdrCall>;
    readonly herdrChanges: PubSub.PubSub<void>;
    readonly transcriptAppends: PubSub.PubSub<{
      readonly session: string;
      readonly entries: ReadonlyArray<TranscriptEntry>;
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
    /** Every Gitea request, as `<method> <owner>/<name> [<number>]`. */
    readonly giteaCalls: Array<string>;
    /** The top-level docs of every project, by `<project>/<file>`. */
    readonly docs: Map<string, string>;
    /** Why the runtime is not set up, when it is not. */
    notSetUp: string | undefined;
    /** The turns the scripted runtime plays, in order, and what it was given. */
    readonly script: Array<ReadonlyArray<ScriptStep>>;
    readonly turns: Array<TurnInput>;
    /** The stored brainstorm chat, and how often it was saved. */
    storedChat: StoredChat | undefined;
    saves: number;
    /** The kept images by id, with when each was saved in epoch milliseconds. */
    readonly images: Map<string, StoredImage & { readonly savedAt: number }>;
    /** The subscribed devices, in the order they subscribed. */
    pushSubscriptions: Array<PushSubscription>;
    readonly pushPublicKey: string;
    /** Why the push store fails, when it does. */
    pushStoreFailure: string | undefined;
    /** Every push sent, with when it was sent in epoch milliseconds. */
    readonly pushes: Array<{
      readonly endpoint: string;
      readonly notification: Notification;
      readonly at: number;
    }>;
    /** The endpoints whose push service answers that the subscription is gone. */
    readonly goneEndpoints: Set<string>;
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
    call: HerdrCall,
    result: () => A,
  ): Effect.Effect<A, HerdrUnavailableError | HerdrRejectedError> =>
    Effect.gen(function* () {
      state.calls.push(call);
      if (!state.available) {
        return yield* new HerdrUnavailableError({ reason: 'connect ENOENT herdr.sock' });
      }
      const code = call.target === undefined ? undefined : state.rejects.get(call.target);
      if (code !== undefined && call.target !== undefined) {
        return yield* new HerdrRejectedError({
          ref: call.target,
          code,
          message: `Herdr said ${code}.`,
        });
      }
      return result();
    });
  return HerdrOutbound.of({
    // A snapshot names no agent, so Herdr never refuses it.
    snapshot: command({ method: 'snapshot' }, () => ({
      agents: [...state.agents],
      workspaces: [...state.workspaces],
    })).pipe(Effect.catchTag('HerdrRejectedError', Effect.die)),
    readScreen: (target) =>
      command({ method: 'readScreen', target }, () => state.screens.get(target) ?? ''),
    prompt: (target, text) => command({ method: 'prompt', target, params: text }, () => undefined),
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

const transcripts = (state: FakeState['Service']) => {
  const find = (source: TranscriptSource) =>
    Option.fromNullishOr(state.transcripts.get(source.session));
  return TranscriptOutbound.of({
    read: (source) =>
      Effect.suspend(() =>
        Option.match(find(source), {
          onNone: () =>
            Effect.fail(
              new TranscriptUnavailableError({ ref: source.ref, reason: 'No session file.' }),
            ),
          onSome: (transcript) =>
            Effect.succeed({ entries: [...transcript.entries], modifiedAt: transcript.modifiedAt }),
        }),
      ),
    follow: (source) =>
      Stream.concat(
        Stream.sync(() => state.transcripts.get(source.session)?.entries ?? []),
        Stream.fromPubSub(state.transcriptAppends).pipe(
          Stream.filter((append) => append.session === source.session),
          Stream.map((append) => append.entries),
        ),
      ),
    modifiedAt: (source) =>
      Effect.sync(() => Option.map(find(source), (transcript) => transcript.modifiedAt)),
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
      Effect.sync(() => Option.fromNullishOr(state.docs.get(`${project.name}/${doc}`))),
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
      pushStore(state, () => {
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
  });
};

/**
 * Plays the next scripted turn. Each step runs only when the consumer pulls its events, as a real
 * runtime streams them: a tool runs after its call event was taken, and nothing after a pausing
 * tool runs. A `fail` step ends the stream with the failure and no `ended`.
 */
const scriptedTurn = (
  state: FakeState['Service'],
  turn: TurnInput,
): Stream.Stream<RuntimeEvent, AgentRuntimeError> =>
  Stream.suspend(() => {
    state.turns.push(turn);
    const steps = state.script.shift() ?? [{ text: 'Scripted Pi has nothing more to say.' }];
    let paused = false;
    const play = (
      step: ScriptStep,
      index: number,
    ): Stream.Stream<RuntimeEvent, AgentRuntimeError> => {
      if (paused) return Stream.empty;
      if ('fail' in step) return Stream.fail(new AgentRuntimeError({ reason: step.fail }));
      if ('die' in step) return Stream.die(new Error(step.die));
      if ('until' in step) return Stream.drain(Stream.fromEffect(step.until));
      if ('text' in step) {
        return Stream.make<Array<RuntimeEvent>>(
          { _tag: 'textDelta', text: step.text },
          { _tag: 'message', text: step.text },
        );
      }
      const callId = `call-${index + 1}`;
      const tool = turn.tools.find((candidate) => candidate.name === step.tool);
      const result = Stream.fromEffect(
        Effect.map(
          tool === undefined
            ? Effect.succeed({ output: `Unknown tool ${step.tool}`, isError: true, pause: false })
            : tool.run(step.input),
          (outcome): RuntimeEvent => {
            paused = outcome.pause;
            return {
              _tag: 'toolResult',
              callId,
              tool: step.tool,
              output: outcome.output,
              isError: outcome.isError,
            };
          },
        ),
      );
      return Stream.concat(
        Stream.make<Array<RuntimeEvent>>({
          _tag: 'toolCall',
          callId,
          tool: step.tool,
          input: step.input as Schema.Json,
        }),
        result,
      );
    };
    const previous = Option.match(turn.state, {
      onNone: () => 0,
      onSome: (stored) => Number(stored.state),
    });
    return Stream.concat(
      Stream.flatMap(
        Stream.fromIterable(steps.map((step, index) => [step, index] as const)),
        ([step, index]) => play(step, index),
      ),
      Stream.make<Array<RuntimeEvent>>({
        _tag: 'ended',
        state: { adapter: 'scripted', state: previous + 1 },
      }),
    );
  });

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
        transcripts: new Map(),
        rejects: new Map(),
        available: true,
        calls: [],
        herdrChanges: yield* PubSub.unbounded<void>(),
        transcriptAppends: yield* PubSub.unbounded<{
          readonly session: string;
          readonly entries: ReadonlyArray<TranscriptEntry>;
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
        origins: new Map([['app', 'gitea:owner/app.git']]),
        worktrees: new Map([['app', [{ path: '/work/app', branch: 'master' }]]]),
        changed: new Set(),
        issues: new Map(),
        giteaConfigured: true,
        giteaFailure: undefined,
        giteaMarkFailure: undefined,
        giteaCalls: [],
        docs: new Map(),
        notSetUp: undefined,
        script: [],
        turns: [],
        storedChat: undefined,
        saves: 0,
        images: new Map(),
        pushSubscriptions: [],
        pushPublicKey: 'BFakePublicKey',
        pushStoreFailure: undefined,
        pushes: [],
        goneEndpoints: new Set(),
      };
    }),
  );
  const ports = Layer.effectContext(
    Effect.gen(function* () {
      const fake = yield* FakeState;
      return Context.make(HerdrOutbound, herdr(fake)).pipe(
        Context.add(TranscriptOutbound, transcripts(fake)),
        Context.add(ProjectsOutbound, projects(fake)),
        Context.add(GiteaOutbound, gitea(fake)),
        Context.add(AgentRuntimeOutbound, {
          get notSetUp() {
            return Option.fromNullishOr(fake.notSetUp);
          },
          runTurn: (turn) => scriptedTurn(fake, turn),
        }),
        Context.add(BrainstormStoreOutbound, {
          load: Effect.sync(() => Option.fromNullishOr(fake.storedChat)),
          save: (chat) =>
            Effect.sync(() => {
              fake.storedChat = chat;
              fake.saves += 1;
            }),
        }),
        Context.add(ImagesOutbound, images(fake)),
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
  return Layer.provideMerge(ports, state);
};
