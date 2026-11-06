import { describe, expect, it } from '@effect/vitest';
import { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { QuickRepliesStoreError } from '../errors.js';
import { QuickRepliesInbound } from '../ports/quick-replies.inbound.port.js';
import { fakeLayer, FakeState } from '../testing/fakes.js';

const layer = () => QuickRepliesInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

describe('QuickRepliesInbound.list', () => {
  it.effect('answers the default replies until the owner saves their own', () =>
    Effect.gen(function* () {
      const replies = yield* QuickRepliesInbound.use((inbound) => inbound.list);

      expect(replies).toEqual({ replies: ['Go ahead', 'Commit and open a PR'] });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('answers the saved replies, even an empty list', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.quickReplies = [];

      const replies = yield* QuickRepliesInbound.use((inbound) => inbound.list);

      expect(replies).toEqual({ replies: [] });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reports a store that cannot read the replies', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.quickRepliesFailure = 'broken file';

      const error = yield* QuickRepliesInbound.use((inbound) => inbound.list).pipe(Effect.flip);

      expect(error).toEqual(new QuickRepliesStoreError({ reason: 'broken file' }));
    }).pipe(Effect.provide(layer())),
  );
});

describe('QuickRepliesInbound.replace', () => {
  it.effect('saves the cleaned list and answers it', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const saved = yield* QuickRepliesInbound.use((inbound) =>
        inbound.replace([' Run the tests first ', 'Go ahead']),
      );

      expect(saved).toEqual({ replies: ['Run the tests first', 'Go ahead'] });
      expect(state.quickReplies).toEqual(['Run the tests first', 'Go ahead']);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('saves nothing for a list that breaks a rule', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const error = yield* QuickRepliesInbound.use((inbound) => inbound.replace(['Go', 'Go'])).pipe(
        Effect.flip,
      );

      expect(error).toBeInstanceOf(InvalidInputError);
      expect(state.quickReplies).toBeUndefined();
    }).pipe(Effect.provide(layer())),
  );
});
