import { keepActivity, type ActivityEvent, type NewActivity } from '@pocket-comms/comms-domain';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import { ActivityStoreOutbound } from '../ports/activity-store.outbound.port.js';

// Shared by the recorder and the input use case: stamps new events and keeps what the timeline
// keeps.

export const makeRecordActivity = Effect.gen(function* () {
  const store = yield* ActivityStoreOutbound;

  const record = Effect.fn('Activity.record')(function* (changes: ReadonlyArray<NewActivity>) {
    if (changes.length === 0) return;
    const now = yield* Clock.currentTimeMillis;
    const events = changes.map(
      (change): ActivityEvent => ({ ...change, id: crypto.randomUUID(), at: now }),
    );
    yield* store.update((held) => keepActivity([...held, ...events], now));
  });

  return { record };
});
