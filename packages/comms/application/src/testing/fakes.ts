import type { Agent, Project, TranscriptEntry, Workspace } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as PubSub from 'effect/PubSub';
import * as Stream from 'effect/Stream';
import {
  HerdrRejectedError,
  HerdrUnavailableError,
  ProjectGitError,
  TranscriptUnavailableError,
} from '../errors.js';
import { HerdrOutbound, type StartedAgent } from '../ports/herdr.outbound.port.js';
import {
  SeenOutbound,
  StatusHistoryOutbound,
  type StatusMark,
} from '../ports/memory.outbound.port.js';
import { ProjectsOutbound } from '../ports/projects.outbound.port.js';
import { TranscriptOutbound, type TranscriptSource } from '../ports/transcript.outbound.port.js';

/** One request the fake Herdr received, so a test can prove what was sent, and what was not. */
export interface HerdrCall {
  readonly method:
    | 'snapshot'
    | 'readScreen'
    | 'prompt'
    | 'sendKeys'
    | 'createWorktree'
    | 'startAgent';
  readonly target?: string;
  readonly params?: unknown;
}

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
  }
>()('comms/application/testing/FakeState') {}

export const fakeWorkspaces: ReadonlyArray<Workspace> = [
  { id: 'w1', label: 'app', group: { key: '/work/app/.git', name: 'app' }, root: '/work/app' },
  { id: 'w2', label: 'feature', group: { key: '/work/app/.git', name: 'app' }, root: '/work/app' },
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
    branchExists: (project, branch) =>
      Effect.as(
        ask(`branchExists ${project.name} ${branch}`),
        state.branches.has(`${project.name}:${branch}`),
      ),
  });
};

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
      };
    }),
  );
  const ports = Layer.effectContext(
    Effect.gen(function* () {
      const fake = yield* FakeState;
      return Context.make(HerdrOutbound, herdr(fake)).pipe(
        Context.add(TranscriptOutbound, transcripts(fake)),
        Context.add(ProjectsOutbound, projects(fake)),
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
