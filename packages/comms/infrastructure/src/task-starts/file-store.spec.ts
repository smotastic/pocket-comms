import { describe, expect, it } from '@effect/vitest';
import { TaskStartsOutbound, TaskStartsStoreError } from '@pocket-comms/comms-application';
import type { TaskStart } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFile } from './file-store.js';

const folder = () => join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'state');

const store = (path: string) =>
  TaskStartsOutbound.pipe(Effect.provide(layerFile({ folder: path })));

const start = (overrides: Partial<TaskStart> = {}): TaskStart => ({
  folder: '/worktrees/fix-12-login',
  project: 'app',
  branch: 'fix/12-login',
  issue: 12,
  kind: 'pi',
  agent: 'fix-12-login',
  prompt: 'Fix the login\n\nCloses #12',
  delivery: 'not-sent',
  reason: 'The agent waits for an answer.',
  at: 5,
  ...overrides,
});

describe('the task starts file store', () => {
  it.effect('loads no starts before the first put', () =>
    Effect.gen(function* () {
      expect(yield* (yield* store(folder())).load).toEqual([]);
    }),
  );

  it.effect('keeps one start per folder, also after a restart, and forgets one', () =>
    Effect.gen(function* () {
      const path = folder();
      const starts = yield* store(path);
      yield* starts.put(start({ delivery: 'pending', reason: undefined, agent: undefined }));
      yield* starts.put(start());
      yield* starts.put(start({ folder: '/worktrees/feat-x', issue: undefined, branch: 'feat/x' }));

      expect(yield* (yield* store(path)).load).toEqual([
        start(),
        start({ folder: '/worktrees/feat-x', issue: undefined, branch: 'feat/x' }),
      ]);

      yield* starts.forget('/worktrees/fix-12-login');
      yield* starts.forget('/worktrees/none');
      expect((yield* (yield* store(path)).load).map((each) => each.folder)).toEqual([
        '/worktrees/feat-x',
      ]);
      expect(statSync(join(path, 'task-starts.json')).mode & 0o777).toBe(0o600);
    }),
  );

  it.effect('loses no start when two puts run at once', () =>
    Effect.gen(function* () {
      const starts = yield* store(folder());
      yield* Effect.all(
        Array.from({ length: 10 }, (_, index) => starts.put(start({ folder: `/w/${index}` }))),
        { concurrency: 'unbounded' },
      );

      expect(yield* starts.load).toHaveLength(10);
    }),
  );

  it.effect('reports a broken file, leaves it alone on a read and writes over it on a change', () =>
    Effect.gen(function* () {
      const path = folder();
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'task-starts.json'), '{"version":1,');
      const starts = yield* store(path);

      expect(yield* starts.load.pipe(Effect.flip)).toBeInstanceOf(TaskStartsStoreError);
      expect(readFileSync(join(path, 'task-starts.json'), 'utf-8')).toBe('{"version":1,');
      yield* starts.put(start());
      expect(yield* starts.load).toEqual([start()]);
    }),
  );
});
