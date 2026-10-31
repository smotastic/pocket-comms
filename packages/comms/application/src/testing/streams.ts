import * as Effect from 'effect/Effect';
import * as Queue from 'effect/Queue';
import type * as Scope from 'effect/Scope';
import * as Stream from 'effect/Stream';

/**
 * Runs `stream` in the background and returns a queue of what it emits. Take from the queue to
 * wait for the next item.
 */
export const collect = <A, E, R>(
  stream: Stream.Stream<A, E, R>,
): Effect.Effect<Queue.Queue<A>, never, R | Scope.Scope> =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<A>();
    yield* stream.pipe(
      Stream.runForEach((item) => Queue.offer(queue, item)),
      Effect.forkScoped,
    );
    return queue;
  });

/**
 * Lets the background fibers run until they wait, so a stream that just emitted has subscribed
 * to the sources it reads next before the test publishes to them.
 */
export const settle = Effect.repeat(Effect.yieldNow, { times: 50 });
