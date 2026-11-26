import { describe, expect, it } from '@effect/vitest';
import { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Layer from 'effect/Layer';
import { TestClock } from 'effect/testing';
import type { CreateTaskInput } from '../dto/task.dto.js';
import { BranchExistsError, RepositoryGitError } from '../errors.js';
import { TasksInbound } from '../ports/tasks.inbound.port.js';
import { FAKE_IMAGES_FOLDER, fakeAgent, fakeLayer, FakeState } from '../testing/fakes.js';

const layer = () => TasksInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const create = (input: Partial<CreateTaskInput> = {}) =>
  TasksInbound.use((inbound) =>
    inbound.create({
      planet: 'app',
      task: 'Add the new task flow\nWith a sheet.',
      branch: 'feat/new-task-flow',
      ...input,
    }),
  );

const herdrMethods = (state: FakeState['Service']) => state.calls.map((call) => call.method);

describe('TasksInbound.create', () => {
  it.effect('creates the worktree from the default remote branch, labelled with the title', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const created = yield* create();

      expect(created).toEqual({
        workspace: 'w-/worktrees/feat-new-task-flow',
        branch: 'feat/new-task-flow',
        path: '/worktrees/feat-new-task-flow',
        agent: undefined,
      });
      expect(state.gitCalls).toEqual([
        'isValidBranchName app feat/new-task-flow',
        'defaultBase app',
        'branchExists app feat/new-task-flow',
        'addWorktree app feat/new-task-flow origin/master',
      ]);
      expect(state.calls).toEqual([
        {
          method: 'openWorktree',
          target: '/worktrees/feat-new-task-flow',
          params: {
            cwd: '/work/app',
            path: '/worktrees/feat-new-task-flow',
            label: 'Add the new task flow',
          },
        },
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

  it.effect('rejects a repository below the root that is not a planet', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.registry = { planets: [] };

      const error = yield* create().pipe(Effect.flip);

      expect(error).toEqual(
        new InvalidInputError({
          issues: [{ field: 'planet', message: 'app is not a planet the app offers.' }],
        }),
      );
      expect(state.calls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect.each(['../etc', 'unknown'])('rejects the planet %j without git or Herdr', (planet) =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const error = yield* create({ planet }).pipe(Effect.flip);

      expect(error).toEqual(
        new InvalidInputError({
          issues: [{ field: 'planet', message: `${planet} is not a planet the app offers.` }],
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

      expect(error).toBeInstanceOf(RepositoryGitError);
      expect(state.calls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect("sends the attached images' paths after the task", () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const id = 'a'.repeat(26);
      state.images.set(id, { kind: 'jpeg', bytes: new Uint8Array(), savedAt: 0 });

      yield* create({ agent: 'claude', imageIds: [id] });

      expect(state.calls.at(-1)).toMatchObject({
        method: 'prompt',
        params: `Add the new task flow\nWith a sheet.\n\n${FAKE_IMAGES_FOLDER}/${id}.jpg`,
      });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses images without an agent, before anything is created', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const id = 'a'.repeat(26);
      state.images.set(id, { kind: 'jpeg', bytes: new Uint8Array(), savedAt: 0 });

      const error = yield* create({ imageIds: [id] }).pipe(Effect.flip);

      expect(error).toEqual(
        new InvalidInputError({
          issues: [{ field: 'imageIds', message: 'Images need an agent to start.' }],
        }),
      );
      expect(state.calls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses an unknown image, before anything is created', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const error = yield* create({ agent: 'claude', imageIds: ['c'.repeat(26)] }).pipe(
        Effect.flip,
      );

      expect(error).toBeInstanceOf(InvalidInputError);
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
          target: 'w-/worktrees/feat-new-task-flow:p1',
          params: {
            paneId: 'w-/worktrees/feat-new-task-flow:p1',
            name: 'feat-new-task-flow',
            kind: 'claude',
          },
        },
        {
          method: 'prompt',
          target: 'w-/worktrees/feat-new-task-flow:p1',
          params: 'Add the new task flow\nWith a sheet.',
        },
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reads and prompts the agent in the pane it started in, which may be a new one', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.started = { status: 'unknown', ready: false, paneId: 't9' };
      state.agents = [fakeAgent({ paneId: 't9', name: 'feat-new-task-flow', status: 'idle' })];

      const fiber = yield* create({ agent: 'claude' }).pipe(Effect.forkChild);
      yield* TestClock.adjust('1 second');
      const created = yield* Fiber.join(fiber);

      expect(created.agent).toMatchObject({ started: true, prompted: true });
      expect(
        state.calls
          .filter((call) => call.method === 'readAgent' || call.method === 'prompt')
          .map((call) => [call.method, call.target]),
      ).toEqual([
        ['readAgent', 't9'],
        ['prompt', 't9'],
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
      state.agents = [
        fakeAgent({ paneId: 'w-/worktrees/feat-new-task-flow:p1', name: 'feat-new-task-flow' }),
      ];
      yield* TestClock.adjust('1 second');
      const created = yield* Fiber.join(fiber);

      expect(created.agent).toMatchObject({ started: true, prompted: true });
      expect(herdrMethods(state).at(-1)).toBe('prompt');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('waits until the idle agent also takes input, as a just-started Pi does', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const paneId = 'w-/worktrees/feat-new-task-flow:p1';
      state.started = { status: 'unknown', ready: false };
      state.agents = [fakeAgent({ paneId, name: 'feat-new-task-flow', kind: 'pi' })];
      state.unready.add(paneId);

      const fiber = yield* create({ agent: 'pi' }).pipe(Effect.forkChild);
      yield* TestClock.adjust('2 seconds');
      expect(herdrMethods(state)).not.toContain('prompt');
      state.unready.delete(paneId);
      yield* TestClock.adjust('1 second');
      const created = yield* Fiber.join(fiber);

      expect(created.agent).toMatchObject({ started: true, prompted: true });
      expect(herdrMethods(state).at(-1)).toBe('prompt');
      expect(herdrMethods(state)).toContain('readAgent');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('sends nothing when the started agent turns out to wait for an answer', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.started = { status: 'unknown', ready: false };
      state.agents = [
        fakeAgent({ paneId: 'w-/worktrees/feat-new-task-flow:p1', status: 'blocked' }),
      ];

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
      state.rejects.set('w-/worktrees/feat-new-task-flow:p1', 'agent_start_timeout');

      const created = yield* create({ agent: 'claude' });

      expect(created.workspace).toBe('w-/worktrees/feat-new-task-flow');
      expect(created.agent).toEqual({
        ref: 'feat-new-task-flow',
        started: false,
        prompted: false,
        note: 'The agent did not start: Herdr said agent_start_timeout.',
      });
    }).pipe(Effect.provide(layer())),
  );
});

describe('TasksInbound.create keeps the task start', () => {
  const folder = '/worktrees/feat-new-task-flow';

  it.effect('forgets the start once the agent has its task', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      yield* create({ agent: 'claude' });

      expect(state.taskStarts.size).toBe(0);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('keeps the prompt of an agent that waits for an answer, with the reason', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.started = { status: 'blocked', ready: false };

      yield* create({ agent: 'pi' });

      expect(state.taskStarts.get(folder)).toMatchObject({
        folder,
        planet: 'app',
        branch: 'feat/new-task-flow',
        issue: undefined,
        kind: 'pi',
        agent: 'feat-new-task-flow',
        prompt: 'Add the new task flow\nWith a sheet.',
        delivery: 'not-sent',
        reason: expect.stringMatching(/waits for an answer/u),
      });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('keeps the start as pending while the agent starts', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.started = { status: 'unknown', ready: false };

      const fiber = yield* create({ agent: 'claude' }).pipe(Effect.forkChild);
      yield* TestClock.adjust('1 second');
      expect(state.taskStarts.get(folder)?.delivery).toBe('pending');
      yield* TestClock.adjust('1 minute');
      yield* Fiber.join(fiber);

      expect(state.taskStarts.get(folder)?.delivery).toBe('not-sent');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('keeps the prompt of an agent that did not start', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.rejects.set('w-/worktrees/feat-new-task-flow:p1', 'agent_start_timeout');

      yield* create({ agent: 'claude' });

      expect(state.taskStarts.get(folder)).toMatchObject({
        delivery: 'not-started',
        agent: undefined,
        reason: 'The agent did not start: Herdr said agent_start_timeout.',
      });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reads a prompt Herdr did not answer as uncertain', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.unanswered.add('w-/worktrees/feat-new-task-flow:p1');

      const created = yield* create({ agent: 'claude' });

      expect(created.agent).toMatchObject({ started: true, prompted: false });
      expect(state.taskStarts.get(folder)?.delivery).toBe('uncertain');
    }).pipe(Effect.provide(layer())),
  );

  it.effect(
    'keeps no start for a task without an agent, and a broken file never fails a start',
    () =>
      Effect.gen(function* () {
        const state = yield* FakeState;

        yield* create();
        expect(state.taskStarts.size).toBe(0);

        state.taskStartsFailure = 'task-starts.json is not readable';
        const created = yield* create({ agent: 'claude', branch: 'feat/other' });
        expect(created.agent).toMatchObject({ started: true, prompted: true });
      }).pipe(Effect.provide(layer())),
  );
});
