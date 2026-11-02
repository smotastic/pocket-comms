import { describe, expect, it } from '@effect/vitest';
import { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { TestClock } from 'effect/testing';
import { ImageNotFoundError } from '../errors.js';
import { ImagesInbound } from '../ports/images.inbound.port.js';
import { fakeLayer, FakeState } from '../testing/fakes.js';

const layer = () => ImagesInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const DAY = 24 * 60 * 60 * 1000;

describe('ImagesInbound.upload', () => {
  it.effect('keeps a PNG and answers its id', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const { id } = yield* ImagesInbound.use((inbound) => inbound.upload(PNG));

      expect(state.images.get(id)).toMatchObject({ kind: 'png', bytes: PNG });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('keeps nothing that is not a JPEG or a PNG', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const error = yield* ImagesInbound.use((inbound) =>
        inbound.upload(new TextEncoder().encode('hello')),
      ).pipe(Effect.flip);

      expect(error).toBeInstanceOf(InvalidInputError);
      expect(state.images.size).toBe(0);
    }).pipe(Effect.provide(layer())),
  );
});

describe('ImagesInbound.read', () => {
  it.effect('reads a kept image and refuses an unknown one', () =>
    Effect.gen(function* () {
      const { id } = yield* ImagesInbound.use((inbound) => inbound.upload(PNG));

      const image = yield* ImagesInbound.use((inbound) => inbound.read(id));
      const error = yield* ImagesInbound.use((inbound) => inbound.read('nope')).pipe(Effect.flip);

      expect(image).toEqual({ kind: 'png', bytes: PNG });
      expect(error).toEqual(new ImageNotFoundError({ id: 'nope' }));
    }).pipe(Effect.provide(layer())),
  );
});

describe('ImagesInbound.sweep', () => {
  it.effect('removes the images older than 30 days only', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const { id: old } = yield* ImagesInbound.use((inbound) => inbound.upload(PNG));
      yield* TestClock.adjust(31 * DAY);
      const { id: fresh } = yield* ImagesInbound.use((inbound) => inbound.upload(PNG));

      yield* ImagesInbound.use((inbound) => inbound.sweep);

      expect([...state.images.keys()]).toEqual([fresh]);
      expect(state.images.has(old)).toBe(false);
    }).pipe(Effect.provide(layer())),
  );
});
