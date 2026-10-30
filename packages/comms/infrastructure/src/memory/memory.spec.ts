import { describe, expect, it } from '@effect/vitest';
import { SeenOutbound, StatusHistoryOutbound } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Option from 'effect/Option';
import * as Stream from 'effect/Stream';
import { layerMemory as seenLayer } from './seen.js';
import { layerMemory as historyLayer } from './status-history.js';

describe('Seen.layerMemory', () => {
  it.effect('remembers seen completions and reports each change', () =>
    Effect.gen(function* () {
      const seenOutbound = yield* SeenOutbound;
      const fiber = yield* seenOutbound.changes.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      );
      yield* Effect.repeat(Effect.yieldNow, { times: 20 });

      yield* seenOutbound.markSeen('w1:p1#3');

      expect([...(yield* seenOutbound.seen)]).toEqual(['w1:p1#3']);
      expect(yield* Fiber.join(fiber)).toHaveLength(1);
    }).pipe(Effect.provide(seenLayer)),
  );
});

describe('StatusHistory.layerMemory', () => {
  it.effect('keeps the last mark of each pane', () =>
    Effect.gen(function* () {
      const statusHistoryOutbound = yield* StatusHistoryOutbound;

      yield* statusHistoryOutbound.set('w1:p1', { status: 'working', since: 1 });
      yield* statusHistoryOutbound.set('w1:p1', { status: 'done', since: 2 });

      expect(yield* statusHistoryOutbound.get('w1:p1')).toEqual(
        Option.some({ status: 'done', since: 2 }),
      );
      expect(yield* statusHistoryOutbound.get('w1:p2')).toEqual(Option.none());
    }).pipe(Effect.provide(historyLayer)),
  );
});
