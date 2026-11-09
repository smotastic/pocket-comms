import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as FileOutbox from './file-outbox.js';
import { Outbox } from './outbox.js';

let folder = '';
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'buddy-outbox-'));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const withOutbox = <A, E>(body: (outbox: Outbox['Service']) => Effect.Effect<A, E>) =>
  Outbox.use(body).pipe(Effect.provide(FileOutbox.layer(folder)));

describe('FileOutbox', () => {
  it.live('keeps clips in the order they were put and answers the oldest', () =>
    withOutbox((outbox) =>
      Effect.gen(function* () {
        const first = yield* outbox.put(Uint8Array.from([1]));
        yield* outbox.put(Uint8Array.from([2]));

        const oldest = yield* outbox.oldest;
        expect(Option.map(oldest, (clip) => [clip.id, [...clip.bytes]])).toEqual(
          Option.some([first.id, [1]]),
        );
        expect(yield* outbox.size).toBe(2);

        yield* outbox.remove(first.id);
        expect(Option.map(yield* outbox.oldest, (clip) => [...clip.bytes])).toEqual(
          Option.some([2]),
        );
        expect(yield* outbox.size).toBe(1);
      }),
    ),
  );

  it.live('answers none when it is empty', () =>
    withOutbox((outbox) =>
      Effect.gen(function* () {
        expect(Option.isNone(yield* outbox.oldest)).toBe(true);
        expect(yield* outbox.size).toBe(0);
      }),
    ),
  );

  it.live('keeps its clips across a restart', () =>
    Effect.gen(function* () {
      yield* withOutbox((outbox) => outbox.put(Uint8Array.from([7])));

      const after = yield* withOutbox((outbox) => outbox.oldest);

      expect(Option.map(after, (clip) => [...clip.bytes])).toEqual(Option.some([7]));
    }),
  );

  it.live('throws away a clip that was never written to the end when it starts', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile(join(folder, '000000000000001-000000.wav.part'), 'x'));

      expect(yield* withOutbox((outbox) => outbox.size)).toBe(0);
      expect(yield* Effect.promise(() => readdir(folder))).toEqual([]);
    }),
  );

  it.live('writes each clip as a .wav file in its folder', () =>
    Effect.gen(function* () {
      yield* withOutbox((outbox) => outbox.put(Uint8Array.from([1])));

      const files = yield* Effect.promise(() => readdir(folder));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/\.wav$/u);
    }),
  );
});
