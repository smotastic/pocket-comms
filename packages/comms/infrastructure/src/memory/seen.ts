import { SeenOutbound } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as PubSub from 'effect/PubSub';
import * as Stream from 'effect/Stream';

/** The seen completions in server memory; a restart forgets them (spec 004, requirement 11). */
export const layerMemory = Layer.effect(
  SeenOutbound,
  Effect.gen(function* () {
    const seen = new Set<string>();
    const changes = yield* PubSub.unbounded<void>();
    return SeenOutbound.of({
      seen: Effect.sync(() => new Set(seen)),
      markSeen: (key) =>
        Effect.suspend(() => {
          if (seen.has(key)) return Effect.void;
          seen.add(key);
          return PubSub.publish(changes, undefined).pipe(Effect.asVoid);
        }),
      changes: Stream.fromPubSub(changes),
    });
  }),
);
