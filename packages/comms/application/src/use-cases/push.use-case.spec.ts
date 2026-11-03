import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { PushStoreError } from '../errors.js';
import { PushInbound } from '../ports/push.inbound.port.js';
import { fakeLayer, FakeState, fakeSubscription } from '../testing/fakes.js';

const layer = () => PushInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

describe('PushInbound.key', () => {
  it.effect("answers the server's public key", () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const key = yield* PushInbound.use((inbound) => inbound.key);

      expect(key).toEqual({ publicKey: state.pushPublicKey });
    }).pipe(Effect.provide(layer())),
  );
});

describe('PushInbound.subscribe', () => {
  it.effect('keeps the device, and keeps it once when it subscribes again', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const phone = fakeSubscription('phone');

      yield* PushInbound.use((inbound) => inbound.subscribe(phone));
      yield* PushInbound.use((inbound) =>
        inbound.subscribe({ ...phone, keys: { p256dh: 'new', auth: 'new' } }),
      );

      expect(state.pushSubscriptions).toEqual([{ ...phone, keys: { p256dh: 'new', auth: 'new' } }]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reports a store that cannot keep the device', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.pushStoreFailure = 'EACCES';

      const error = yield* PushInbound.use((inbound) =>
        inbound.subscribe(fakeSubscription('phone')),
      ).pipe(Effect.flip);

      expect(error).toEqual(new PushStoreError({ reason: 'EACCES' }));
    }).pipe(Effect.provide(layer())),
  );
});

describe('PushInbound.unsubscribe', () => {
  it.effect('forgets the device and keeps the others', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const phone = fakeSubscription('phone');
      const laptop = fakeSubscription('laptop');
      yield* PushInbound.use((inbound) => inbound.subscribe(phone));
      yield* PushInbound.use((inbound) => inbound.subscribe(laptop));

      yield* PushInbound.use((inbound) => inbound.unsubscribe(phone.endpoint));

      expect(state.pushSubscriptions).toEqual([laptop]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('does nothing for a device it does not know', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      yield* PushInbound.use((inbound) => inbound.unsubscribe('https://push.example/unknown'));

      expect(state.pushSubscriptions).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );
});
