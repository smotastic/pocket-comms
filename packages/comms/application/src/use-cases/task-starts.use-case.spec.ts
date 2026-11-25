import { describe, expect, it } from '@effect/vitest';
import {
  InvalidInputError,
  issueTask,
  type Agent,
  type TaskStart,
} from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import {
  AgentNotReadyError,
  DeliveryUncertainError,
  NoTaskStartError,
  WorktreeBusyError,
  WorktreeNotFoundError,
} from '../errors.js';
import { TaskStartsInbound } from '../ports/task-starts.inbound.port.js';
import { fakeAgent, fakeIssue, fakeLayer, FakeState } from '../testing/fakes.js';

const layer = () => TaskStartsInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const FOLDER = '/worktrees/fix-12-login';
const PANE = 'w5:p1';

const ISSUE = fakeIssue({ number: 12, title: 'Fix the login' });

const AGENT = (overrides: Partial<Agent> = {}) =>
  fakeAgent({
    paneId: PANE,
    name: 'fix-12-login',
    kind: 'pi',
    workspaceId: 'w5',
    cwd: FOLDER,
    ...overrides,
  });

const kept = (overrides: Partial<TaskStart> = {}): TaskStart => ({
  folder: FOLDER,
  project: 'app',
  branch: 'fix/12-login',
  issue: 12,
  kind: 'pi',
  agent: 'fix-12-login',
  prompt: 'Fix the login\n\nCloses #12',
  delivery: 'not-sent',
  reason: 'The agent waits for an answer, so the task was not sent.',
  at: 1,
  ...overrides,
});

// `fix-12-login` works in the linked worktree of issue #12 of `app`, in workspace `w5`.
const arrange = (start: TaskStart | null = kept()) =>
  Effect.gen(function* () {
    const state = yield* FakeState;
    state.worktrees.set('app', [
      { path: '/work/app', branch: 'master' },
      { path: FOLDER, branch: 'fix/12-login' },
    ]);
    state.workspaces = [
      ...state.workspaces,
      {
        id: 'w5',
        label: 'fix-12-login',
        group: { key: '/work/app/.git', name: 'app' },
        root: '/work/app',
        project: 'app',
        worktree: 'fix-12-login',
        checkout: FOLDER,
      },
    ];
    state.agents = [AGENT()];
    state.issues.set('owner/app', [ISSUE]);
    if (start !== null) state.taskStarts.set(start.folder, start);
    return state;
  });

const prompts = (state: FakeState['Service']) =>
  state.calls.filter((call) => call.method === 'prompt');

describe('TaskStartsInbound.forAgent', () => {
  it.effect("shows the kept start of the agent's worktree with the agent's readiness now", () =>
    Effect.gen(function* () {
      yield* arrange();

      const start = yield* TaskStartsInbound.use((inbound) =>
        inbound.forAgent('fix-12-login', false),
      );

      expect(start).toEqual({
        source: 'kept',
        delivery: 'not-sent',
        reason: 'The agent waits for an answer, so the task was not sent.',
        prompt: 'Fix the login\n\nCloses #12',
        branch: 'fix/12-login',
        issue: 12,
        agent: { status: 'idle', ready: true },
      });
    }).pipe(Effect.provide(layer())),
  );

  it.effect("builds the issue's task only when asked, as uncertain", () =>
    Effect.gen(function* () {
      const state = yield* arrange(null);

      const none = yield* TaskStartsInbound.use((inbound) =>
        inbound.forAgent('fix-12-login', false),
      );
      const built = yield* TaskStartsInbound.use((inbound) =>
        inbound.forAgent('fix-12-login', true),
      );

      expect(none).toBeUndefined();
      expect(built).toMatchObject({
        source: 'issue',
        delivery: 'uncertain',
        prompt: issueTask(ISSUE),
        issue: 12,
      });
      expect(state.taskStarts.size).toBe(0);
    }).pipe(Effect.provide(layer())),
  );
});

describe('TaskStartsInbound.send', () => {
  const send = (input: { prompt?: string; anyway?: boolean; fromIssue?: boolean } = {}) =>
    TaskStartsInbound.use((inbound) =>
      inbound.send('fix-12-login', { prompt: 'Fix the login\n\nCloses #12', ...input }),
    );

  it.effect('sends the edited prompt once and forgets the start', () =>
    Effect.gen(function* () {
      const state = yield* arrange();

      const sent = yield* send({ prompt: 'Fix the login, please\n\nCloses #12' });

      expect(sent).toEqual({ delivery: 'delivered', reason: undefined });
      expect(prompts(state)).toEqual([
        { method: 'prompt', target: PANE, params: 'Fix the login, please\n\nCloses #12' },
      ]);
      expect(state.taskStarts.size).toBe(0);
      expect(state.activity.at(-1)).toMatchObject({ type: 'prompt' });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('sends nothing to an agent that waits for an answer, or is not ready', () =>
    Effect.gen(function* () {
      const state = yield* arrange();
      state.agents = [AGENT({ status: 'blocked' })];

      expect(yield* send().pipe(Effect.flip)).toBeInstanceOf(AgentNotReadyError);
      state.agents = [AGENT()];
      state.unready.add(PANE);
      expect(yield* send().pipe(Effect.flip)).toBeInstanceOf(AgentNotReadyError);

      expect(prompts(state)).toEqual([]);
      expect(state.calls.some((call) => call.method === 'sendKeys')).toBe(false);
      expect(state.taskStarts.get(FOLDER)?.delivery).toBe('not-sent');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('sends an uncertain prompt only when the owner says so', () =>
    Effect.gen(function* () {
      const state = yield* arrange(kept({ delivery: 'uncertain' }));

      expect(yield* send().pipe(Effect.flip)).toBeInstanceOf(DeliveryUncertainError);
      expect(prompts(state)).toEqual([]);

      expect(yield* send({ anyway: true })).toMatchObject({ delivery: 'delivered' });
      expect(prompts(state)).toHaveLength(1);
    }).pipe(Effect.provide(layer())),
  );

  it.effect("sends the issue's task only anyway, when the worktree has no start", () =>
    Effect.gen(function* () {
      const state = yield* arrange(null);

      expect(yield* send().pipe(Effect.flip)).toBeInstanceOf(NoTaskStartError);
      expect(yield* send({ fromIssue: true }).pipe(Effect.flip)).toBeInstanceOf(
        DeliveryUncertainError,
      );
      expect(yield* send({ fromIssue: true, anyway: true })).toMatchObject({
        delivery: 'delivered',
      });
      expect(prompts(state)).toHaveLength(1);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('keeps the start with the new reason when Herdr refuses, or as uncertain', () =>
    Effect.gen(function* () {
      const state = yield* arrange();
      state.unanswered.add(PANE);

      expect(yield* send()).toMatchObject({ delivery: 'uncertain' });
      expect(state.taskStarts.get(FOLDER)?.delivery).toBe('uncertain');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('sends to an agent that finished its turn and takes input', () =>
    Effect.gen(function* () {
      const state = yield* arrange();
      state.agents = [AGENT({ status: 'done' })];

      expect(yield* send()).toMatchObject({ delivery: 'delivered' });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses an empty prompt', () =>
    Effect.gen(function* () {
      yield* arrange();

      expect(yield* send({ prompt: '  ' }).pipe(Effect.flip)).toBeInstanceOf(InvalidInputError);
    }).pipe(Effect.provide(layer())),
  );
});

describe('TaskStartsInbound.dismiss', () => {
  it.effect('forgets the start without sending anything', () =>
    Effect.gen(function* () {
      const state = yield* arrange();

      yield* TaskStartsInbound.use((inbound) => inbound.dismiss('fix-12-login'));

      expect(state.taskStarts.size).toBe(0);
      expect(prompts(state)).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );
});

describe('TaskStartsInbound.startInWorktree', () => {
  const start = (branch = 'fix/12-login') =>
    TaskStartsInbound.use((inbound) =>
      inbound.startInWorktree({ project: 'app', number: 12, branch, agent: 'pi' }),
    );

  it.effect('starts the agent in a new shell of the worktree and sends the kept prompt', () =>
    Effect.gen(function* () {
      const state = yield* arrange(kept({ delivery: 'not-started', agent: undefined }));
      state.agents = [];

      const created = yield* start();

      expect(created).toMatchObject({
        workspace: 'w5',
        branch: 'fix/12-login',
        path: FOLDER,
        agent: { ref: 'fix-12-login', started: true, prompted: true },
      });
      expect(state.gitCalls.filter((call) => call.startsWith('addWorktree'))).toEqual([]);
      expect(state.calls.filter((call) => call.method !== 'snapshot')).toEqual([
        { method: 'openShell', target: 'w5' },
        {
          method: 'startAgent',
          target: 'w5:p9',
          params: { paneId: 'w5:p9', name: 'fix-12-login', kind: 'pi' },
        },
        { method: 'prompt', target: 'w5:p9', params: 'Fix the login\n\nCloses #12' },
      ]);
      expect(state.taskStarts.size).toBe(0);
    }).pipe(Effect.provide(layer())),
  );

  it.effect("opens the worktree when Herdr has no workspace for it, with the issue's task", () =>
    Effect.gen(function* () {
      const state = yield* arrange(null);
      state.agents = [];
      state.workspaces = state.workspaces.filter((workspace) => workspace.id !== 'w5');

      yield* start();

      expect(state.calls.find((call) => call.method === 'openWorktree')).toEqual({
        method: 'openWorktree',
        target: FOLDER,
        params: { cwd: '/work/app', path: FOLDER },
      });
      expect(prompts(state)).toEqual([
        {
          method: 'prompt',
          target: `w-${FOLDER}:p1`,
          params: issueTask(ISSUE),
        },
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('never starts a second agent, nor one while a start runs', () =>
    Effect.gen(function* () {
      const state = yield* arrange();

      expect(yield* start().pipe(Effect.flip)).toBeInstanceOf(WorktreeBusyError);
      state.agents = [];
      state.taskStarts.set(FOLDER, kept({ delivery: 'pending' }));
      expect(yield* start().pipe(Effect.flip)).toBeInstanceOf(WorktreeBusyError);
      expect(state.calls.map((call) => call.method)).not.toContain('startAgent');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('takes only a linked worktree of the issue, never the primary checkout', () =>
    Effect.gen(function* () {
      const state = yield* arrange();
      state.agents = [];

      expect(yield* start('master').pipe(Effect.flip)).toBeInstanceOf(WorktreeNotFoundError);
      expect(yield* start('fix/13-other').pipe(Effect.flip)).toBeInstanceOf(WorktreeNotFoundError);
      expect(state.calls.map((call) => call.method)).not.toContain('startAgent');
    }).pipe(Effect.provide(layer())),
  );
});

describe('TaskStartsInbound after a restart', () => {
  it.effect('reads a start that was pending as uncertain', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.taskStarts.set(FOLDER, kept({ delivery: 'pending' }));

      yield* Layer.build(TaskStartsInbound.layer);

      expect(state.taskStarts.get(FOLDER)?.delivery).toBe('uncertain');
    }).pipe(Effect.scoped, Effect.provide(fakeLayer())),
  );
});
