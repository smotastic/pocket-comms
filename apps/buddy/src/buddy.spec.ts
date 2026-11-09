import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Queue from 'effect/Queue';
import { TestClock } from 'effect/testing';
import { buddy } from './buddy.js';
import { makeFakes, settle } from './testing.js';

/** Runs the buddy on fakes; `body` drives it, then the owner quits. */
const withBuddy = <A, E>(
  body: (fakes: Effect.Success<typeof makeFakes>['fake']) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const { fake, layer } = yield* makeFakes;
    const running = yield* buddy.pipe(Effect.provide(layer), Effect.forkChild);
    yield* settle;
    const result = yield* body(fake);
    yield* Queue.offer(fake.intents, { _tag: 'Quit' });
    yield* Fiber.join(running);
    return result;
  });

const press = (fake: Effect.Success<typeof makeFakes>['fake'], tag: 'Press' | 'Release') =>
  Queue.offer(fake.intents, { _tag: tag }).pipe(Effect.andThen(settle));

const wait = (millis: number) => TestClock.adjust(millis).pipe(Effect.andThen(settle));

const lastView = (fake: Effect.Success<typeof makeFakes>['fake']) => fake.views.at(-1);

describe('the buddy', () => {
  it.effect('starts ready and stops when the owner quits', () =>
    withBuddy((fake) =>
      Effect.sync(() => {
        expect(lastView(fake)?.status).toBe('Ready');
      }),
    ),
  );
});

describe('recording', () => {
  it.effect('records while the button is held and keeps the clip in the outbox', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        yield* press(fake, 'Press');
        expect(fake.recorder.recording).toBe(true);
        yield* wait(12_000);
        expect(lastView(fake)?.status).toBe('Recording 0:12');

        yield* press(fake, 'Release');

        expect(fake.recorder.recording).toBe(false);
        expect(fake.outbox.map((clip) => [...clip.bytes])).toEqual([[1]]);
      }),
    ),
  );

  it.effect('drops a clip shorter than half a second as a slip of the button', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        yield* press(fake, 'Press');
        yield* wait(300);
        yield* press(fake, 'Release');

        expect(fake.recorder.recording).toBe(false);
        expect(fake.outbox).toEqual([]);
      }),
    ),
  );

  it.effect('ends a recording by itself after two minutes', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        yield* press(fake, 'Press');
        yield* wait(119_999);
        expect(fake.recorder.recording).toBe(true);
        yield* wait(1);

        expect(fake.recorder.recording).toBe(false);
        expect(fake.outbox).toHaveLength(1);

        // The release that follows the limit starts nothing.
        yield* press(fake, 'Release');
        expect(fake.recorder.started).toBe(1);
      }),
    ),
  );

  it.effect('says why the microphone did not record', () =>
    withBuddy((fake) =>
      Effect.gen(function* () {
        fake.recorder.failure = 'ffmpeg is not installed.';

        yield* press(fake, 'Press');

        expect(lastView(fake)?.status).toBe('Ready · ffmpeg is not installed.');
        expect(fake.outbox).toEqual([]);
      }),
    ),
  );

  it.effect('keeps a recording that is under way when the owner quits', () =>
    Effect.gen(function* () {
      const { fake, layer } = yield* makeFakes;
      const running = yield* buddy.pipe(Effect.provide(layer), Effect.forkChild);
      yield* settle;
      yield* press(fake, 'Press');
      yield* wait(2_000);

      yield* Queue.offer(fake.intents, { _tag: 'Quit' });
      yield* Fiber.join(running);

      expect(fake.recorder.recording).toBe(false);
      expect(fake.outbox).toHaveLength(1);
    }),
  );
});
