import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { BookmarkNotFoundError } from '../errors.js';
import { BookmarksInbound } from '../ports/bookmark.inbound.port.js';
import { fakeLayer } from '../testing/fakes.js';

const layer = BookmarksInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

describe('BookmarksInbound.get', () => {
  it.effect('returns a stored bookmark', () =>
    Effect.gen(function* () {
      const created = yield* BookmarksInbound.use((inbound) =>
        inbound.create({ url: 'https://effect.website', title: 'Effect', tags: [] }),
      );
      const found = yield* BookmarksInbound.use((inbound) => inbound.get(created.id));
      expect(found).toEqual(created);
    }).pipe(Effect.provide(layer)),
  );

  it.effect.each(['0192f3a1-7b2c-7d3e-8f40-0000000000ff', 'not-a-uuid'])(
    'reports an unknown id %s as not found',
    (id) =>
      Effect.gen(function* () {
        const error = yield* BookmarksInbound.use((inbound) => inbound.get(id)).pipe(Effect.flip);
        expect(error).toEqual(new BookmarkNotFoundError({ id }));
      }).pipe(Effect.provide(layer)),
  );
});
