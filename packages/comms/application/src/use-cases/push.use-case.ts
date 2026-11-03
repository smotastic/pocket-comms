import * as Effect from 'effect/Effect';
import type { PushKeyDto, PushSubscriptionDto } from '../dto/push.dto.js';
import { PushKeysOutbound, PushSubscriptionsOutbound } from '../ports/push.outbound.port.js';

// The devices the owner turned notifications on for, one per browser subscription.

export const makePush = Effect.gen(function* () {
  const pushKeysOutbound = yield* PushKeysOutbound;
  const pushSubscriptionsOutbound = yield* PushSubscriptionsOutbound;

  const key = pushKeysOutbound.publicKey.pipe(
    Effect.map((publicKey) => ({ publicKey }) satisfies PushKeyDto),
    Effect.withSpan('Push.key'),
  );

  const subscribe = Effect.fn('Push.subscribe')(function* (subscription: PushSubscriptionDto) {
    yield* pushSubscriptionsOutbound.save({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    });
  });

  const unsubscribe = Effect.fn('Push.unsubscribe')(function* (endpoint: string) {
    yield* pushSubscriptionsOutbound.remove(endpoint);
  });

  return { key, subscribe, unsubscribe };
});
