import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Queue from 'effect/Queue';
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
