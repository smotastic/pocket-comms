import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { PushKeyDto, PushSubscriptionDto } from '../dto/push.dto.js';
import type { PushStoreError } from '../errors.js';
import { makeNotify } from '../use-cases/notify.use-case.js';
import { makePush } from '../use-cases/push.use-case.js';

// The inbound port of the push resource: the devices that get a notification when an agent needs
// the owner.

export class PushInbound extends Context.Service<
  PushInbound,
  {
    readonly key: Effect.Effect<PushKeyDto, PushStoreError>;
    readonly subscribe: (subscription: PushSubscriptionDto) => Effect.Effect<void, PushStoreError>;
    readonly unsubscribe: (endpoint: string) => Effect.Effect<void, PushStoreError>;
    /** Watches the agents and notifies the devices; it runs until it is interrupted. */
    readonly watch: Effect.Effect<void>;
  }
>()('comms/application/PushInbound') {
  static readonly layer = Layer.effect(
    PushInbound,
    Effect.gen(function* () {
      return { ...(yield* makePush), ...(yield* makeNotify) };
    }),
  );
}
