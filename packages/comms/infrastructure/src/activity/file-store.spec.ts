import { describe, expect, it } from '@effect/vitest';
import { ActivityStoreOutbound } from '@pocket-comms/comms-application';
import type { ActivityEvent } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Stream from 'effect/Stream';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFile } from './file-store.js';

const folder = () => join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'state');

const agent = {
  paneId: 'w1:p1',
  ref: 'kirk',
  name: 'kirk',
  workspace: 'feature',
  project: 'app',
  worktree: 'feature',
};

const events: ReadonlyArray<ActivityEvent> = [
  { id: 'e1', at: 1, type: 'appeared', agent },
  { id: 'e2', at: 2, type: 'status', status: 'blocked', agent },
  { id: 'e3', at: 3, type: 'prompt', excerpt: 'Fix the build', images: 2, agent },
  { id: 'e4', at: 4, type: 'keys', keys: ['2', 'enter'], agent },
  { id: 'e6', at: 4, type: 'typed', excerpt: 'Use SQLite', agent },
  {
    id: 'e5',
    at: 5,
    type: 'gone',
    agent: { ...agent, name: undefined, ref: 'w1:p1', project: undefined, worktree: undefined },
  },
];

const store = (path: string) =>
  ActivityStoreOutbound.pipe(Effect.provide(layerFile({ folder: path })));

describe('the activity file store', () => {
  it.effect('has no events before the first update', () =>
    Effect.gen(function* () {
      expect(yield* (yield* store(folder())).events).toEqual([]);
    }),
  );

  it.effect('keeps what it was given across a restart, readable by the owner only', () =>
    Effect.gen(function* () {
      const path = folder();
      const outbound = yield* store(path);

      yield* outbound.update(() => events);

      expect(yield* outbound.events).toEqual(events);
      expect(yield* (yield* store(path)).events).toEqual(events);
      expect(statSync(join(path, 'activity.json')).mode & 0o777).toBe(0o600);
    }),
  );

  it.effect('applies concurrent updates one after the other', () =>
    Effect.gen(function* () {
      const path = folder();
      const outbound = yield* store(path);

      yield* Effect.forEach(events, (event) => outbound.update((held) => [...held, event]), {
        concurrency: 'unbounded',
      });

      expect((yield* (yield* store(path)).events).map((event) => event.id).sort()).toEqual([
        'e1',
        'e2',
        'e3',
        'e4',
        'e5',
        'e6',
      ]);
    }),
  );

  it.effect('reports each update', () =>
    Effect.gen(function* () {
      const outbound = yield* store(folder());
      const fiber = yield* outbound.changes.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      );
      yield* Effect.repeat(Effect.yieldNow, { times: 20 });

      yield* outbound.update(() => events);

      expect(yield* Fiber.join(fiber)).toHaveLength(1);
    }),
  );

  it.effect('keeps an unreadable file as .bad and starts empty', () =>
    Effect.gen(function* () {
      const path = folder();
      yield* (yield* store(path)).update(() => events);
      writeFileSync(join(path, 'activity.json'), '{"version":1,');

      expect(yield* (yield* store(path)).events).toEqual([]);
      expect(readFileSync(join(path, 'activity.json.bad'), 'utf-8')).toBe('{"version":1,');
      expect(existsSync(join(path, 'activity.json'))).toBe(false);
    }),
  );
});
