import { describe, expect, it } from '@effect/vitest';
import { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Layer from 'effect/Layer';
import { TestClock } from 'effect/testing';
import type { CreateTaskInput } from '../dto/task.dto.js';
import { BranchExistsError, ProjectGitError } from '../errors.js';
import { TasksInbound } from '../ports/tasks.inbound.port.js';
import { fakeAgent, fakeLayer, FakeState } from '../testing/fakes.js';

const layer = () => TasksInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const create = (input: Partial<CreateTaskInput> = {}) =>
  TasksInbound.use((inbound) =>
    inbound.create({
      project: 'app',
      task: 'Add the new task flow\nWith a sheet.',
      branch: 'feat/new-task-flow',
      ...input,
    }),
  );

const herdrMethods = (state: FakeState['Service']) => state.calls.map((call) => call.method);

describe('TasksInbound.projects', () => {
  it.effect('offers the projects open in Herdr first', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.projects = [
        { name: 'zeta', path: '/work/zeta' },
        { name: 'beta', path: '/work/beta' },
        { name: 'app', path: '/work/app' },
      ];

      const projects = yield* TasksInbound.use((inbound) => inbound.projects);

      expect(projects).toEqual([
        { name: 'app', open: true },
        { name: 'beta', open: false },
        { name: 'zeta', open: false },
      ]);
    }).pipe(Effect.provide(layer())),
  );
});

describe('TasksInbound.create', () => {
  it.effect('creates the worktree from the default remote branch, labelled with the title', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const created = yield* create();

      expect(created).toEqual({
        workspace: 'w-feat/new-task-flow',
        branch: 'feat/new-task-flow',
        path: '/worktrees/feat-new-task-flow',
        agent: undefined,
      });
      expect(state.calls).toEqual([
        {
          method: 'createWorktree',
          target: 'feat/new-task-flow',
          params: {
            cwd: '/work/app',
            branch: 'feat/new-task-flow',
            base: 'origin/master',
            label: 'Add the new task flow',
          },
        },
      ]);
      expect(state.gitCalls).toEqual([
        'isValidBranchName app feat/new-task-flow',
        'defaultBase app',
        'branchExists app feat/new-task-flow',
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reports every invalid field and calls neither git nor Herdr', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const error = yield* create({ task: ' ', branch: 'Feature/Foo', agent: 'codex' }).pipe(
        Effect.flip,
      );

      expect(error).toBeInstanceOf(InvalidInputError);
      expect(
        error instanceof InvalidInputError && error.issues.map((issue) => issue.field),
      ).toEqual(['task', 'branch', 'agent']);
      expect(state.gitCalls).toEqual([]);
      expect(state.calls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect.each(['../etc', 'unknown'])('rejects the project %j without git or Herdr', (project) =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const error = yield* create({ project }).pipe(Effect.flip);

      expect(error).toEqual(
        new InvalidInputError({
          issues: [{ field: 'project', message: `${project} is not a project the app offers.` }],
        }),
      );
      expect(state.gitCalls).toEqual([]);
      expect(state.calls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('rejects a branch name git refuses', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.badBranchNames.add('feat/new-task-flow');

      const error = yield* create().pipe(Effect.flip);

      expect(error).toBeInstanceOf(InvalidInputError);
      expect(state.calls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('creates nothing when the branch exists', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.branches.add('app:feat/new-task-flow');

      const error = yield* create().pipe(Effect.flip);

      expect(error).toEqual(new BranchExistsError({ branch: 'feat/new-task-flow' }));
      expect(state.calls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('creates nothing when git cannot fetch', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.bases.clear();

      const error = yield* create().pipe(Effect.flip);

      expect(error).toBeInstanceOf(ProjectGitError);
      expect(state.calls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('starts the agent in the new pane and sends it the task', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const created = yield* create({ agent: 'claude' });

      expect(created.agent).toEqual({
        ref: 'feat-new-task-flow',
        started: true,
        prompted: true,
        note: undefined,
      });
      expect(state.calls.slice(-2)).toEqual([
        {
          method: 'startAgent',
          target: 'w-feat/new-task-flow:p1',
          params: { paneId: 'w-feat/new-task-flow:p1', name: 'feat-new-task-flow', kind: 'claude' },
        },
        {
          method: 'prompt',
          target: 'w-feat/new-task-flow:p1',
          params: 'Add the new task flow\nWith a sheet.',
        },
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('numbers the agent when a live agent has its name', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'feat-new-task-flow' })];

      const created = yield* create({ agent: 'pi' });

      expect(created.agent?.ref).toBe('feat-new-task-flow-2');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('sends nothing to an agent that waits for an answer', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.started = { status: 'blocked', ready: false };

      const created = yield* create({ agent: 'claude' });

      expect(created.agent).toMatchObject({ started: true, prompted: false });
      expect(created.agent?.note).toMatch(/not sent/u);
      expect(herdrMethods(state)).not.toContain('prompt');
      expect(herdrMethods(state)).not.toContain('sendKeys');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('waits until Herdr reports the started agent idle, then sends the task', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.started = { status: 'unknown', ready: true };

      const fiber = yield* create({ agent: 'claude' }).pipe(Effect.forkChild);
      yield* TestClock.adjust('1 second');
      expect(herdrMethods(state)).not.toContain('prompt');
      state.agents = [fakeAgent({ paneId: 'w-feat/new-task-flow:p1', name: 'feat-new-task-flow' })];
      yield* TestClock.adjust('1 second');
      const created = yield* Fiber.join(fiber);

      expect(created.agent).toMatchObject({ started: true, prompted: true });
      expect(herdrMethods(state).at(-1)).toBe('prompt');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('sends nothing when the started agent turns out to wait for an answer', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.started = { status: 'unknown', ready: false };
      state.agents = [fakeAgent({ paneId: 'w-feat/new-task-flow:p1', status: 'blocked' })];

      const fiber = yield* create({ agent: 'claude' }).pipe(Effect.forkChild);
      yield* TestClock.adjust('1 second');
      const created = yield* Fiber.join(fiber);

      expect(created.agent?.note).toMatch(/waits for an answer/u);
      expect(herdrMethods(state)).not.toContain('prompt');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('gives up on sending after the settle time', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.started = { status: 'unknown', ready: false };

      const fiber = yield* create({ agent: 'pi' }).pipe(Effect.forkChild);
      yield* TestClock.adjust('1 minute');
      const created = yield* Fiber.join(fiber);

      expect(created.agent?.note).toMatch(/did not report itself ready/u);
      expect(herdrMethods(state)).not.toContain('prompt');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('keeps the worktree and notes why when the agent does not start', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.rejects.set('w-feat/new-task-flow:p1', 'agent_start_timeout');

      const created = yield* create({ agent: 'claude' });

      expect(created.workspace).toBe('w-feat/new-task-flow');
      expect(created.agent).toEqual({
        ref: 'feat-new-task-flow',
        started: false,
        prompted: false,
        note: 'The agent did not start: Herdr said agent_start_timeout.',
      });
    }).pipe(Effect.provide(layer())),
  );
});
