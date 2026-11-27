import { describe, expect, it } from '@effect/vitest';
import { PlanetsOutbound } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Option from 'effect/Option';
import * as Stream from 'effect/Stream';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFile } from './file-store.js';

const folder = () => join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'state');

const store = (path: string) => PlanetsOutbound.pipe(Effect.provide(layerFile({ folder: path })));

const registry = {
  appsSeeded: true,
  planets: [
    { name: 'app', autonomy: 'manual' as const, apps: ['app'] },
    { name: 'home', autonomy: 'manual' as const },
  ],
};

describe('the planets file store', () => {
  it.effect('has no registry before the first save', () =>
    Effect.gen(function* () {
      expect(yield* (yield* store(folder())).load).toEqual(Option.none());
    }),
  );

  it.effect('loads what it saved, also after a restart, readable by the owner only', () =>
    Effect.gen(function* () {
      const path = folder();
      yield* (yield* store(path)).save(registry);

      expect(yield* (yield* store(path)).load).toEqual(Option.some(registry));
      expect(JSON.parse(readFileSync(join(path, 'planets.json'), 'utf-8'))).toEqual({
        version: 1,
        ...registry,
      });
      expect(statSync(join(path, 'planets.json')).mode & 0o777).toBe(0o600);
    }),
  );

  it.effect('keeps an unreadable file as .bad and has no registry', () =>
    Effect.gen(function* () {
      const path = folder();
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'planets.json'), '{"version":9}');

      expect(yield* (yield* store(path)).load).toEqual(Option.none());
      expect(existsSync(join(path, 'planets.json.bad'))).toBe(true);
    }),
  );

  it.effect('reports every save as a change', () =>
    Effect.gen(function* () {
      const outbound = yield* store(folder());
      const fiber = yield* outbound.changes.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      );
      yield* Effect.yieldNow;

      yield* outbound.save(registry);

      expect(yield* Fiber.join(fiber)).toHaveLength(1);
    }),
  );
});
