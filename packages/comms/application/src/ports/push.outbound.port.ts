import type { Notification, PushSubscription } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type { PushStoreError } from '../errors.js';

/** The devices that get a push, one subscription per endpoint. */
export class PushSubscriptionsOutbound extends Context.Service<
  PushSubscriptionsOutbound,
  {
    readonly list: Effect.Effect<ReadonlyArray<PushSubscription>, PushStoreError>;
    /** Keeps the subscription, in place of one with the same endpoint. */
    readonly save: (subscription: PushSubscription) => Effect.Effect<void, PushStoreError>;
    /** Forgets the subscription of `endpoint`; an unknown one is no error. */
    readonly remove: (endpoint: string) => Effect.Effect<void, PushStoreError>;
  }
>()('comms/application/PushSubscriptionsOutbound') {}

/** The server's VAPID key pair; it is made once and kept, so devices stay subscribed. */
export class PushKeysOutbound extends Context.Service<
  PushKeysOutbound,
  {
    /** The public key, base64url, that a device subscribes with. */
    readonly publicKey: Effect.Effect<string, PushStoreError>;
  }
>()('comms/application/PushKeysOutbound') {}

/** What the push service said: it took the push, or the subscription no longer exists. */
export type PushOutcome = 'sent' | 'gone';

/** Sends one notification to one device through its browser's push service. */
export class PushSenderOutbound extends Context.Service<
  PushSenderOutbound,
  {
    /** A failure other than a gone subscription is logged by the adapter and answers `sent`. */
    readonly send: (
      subscription: PushSubscription,
      notification: Notification,
    ) => Effect.Effect<PushOutcome>;
  }
>()('comms/application/PushSenderOutbound') {}
