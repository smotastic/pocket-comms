import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { BookmarkNotFoundError, VersionMismatchError } from '../errors.js';
import { BookmarksInbound } from '../ports/bookmark.inbound.port.js';
import { FakeState, fakeLayer } from '../testing/fakes.js';

const layer = BookmarksInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const create = BookmarksInbound.use((inbound) =>
  inbound.create({ url: 'https://effect.website', title: 'Effect', tags: [] }),
);
const remove = (input: Parameters<BookmarksInbound['Service']['delete']>[0]) =>
  BookmarksInbound.use((inbound) => inbound.delete(input));

describe('BookmarksInbound.delete', () => {
  it.effect('deletes a bookmark', () =>
    Effect.gen(function* () {
      const created = yield* create;
      yield* remove({ id: created.id });
      const state = yield* FakeState;
      expect(state.bookmarks.has(created.id)).toBe(false);
    }).pipe(Effect.provide(layer)),
  );

  it.effect('rejects a stale expected version and keeps the bookmark', () =>
    Effect.gen(function* () {
      const created = yield* create;
      const error = yield* remove({ id: created.id, expectedVersion: 2 }).pipe(Effect.flip);
      expect(error).toEqual(new VersionMismatchError({ id: created.id, expected: 2 }));
      expect((yield* FakeState).bookmarks.has(created.id)).toBe(true);
    }).pipe(Effect.provide(layer)),
  );

  it.effect('reports an unknown id as not found', () =>
    Effect.gen(function* () {
      const id = '0192f3a1-7b2c-7d3e-8f40-0000000000ff';
      expect(yield* remove({ id }).pipe(Effect.flip)).toEqual(new BookmarkNotFoundError({ id }));
    }).pipe(Effect.provide(layer)),
  );
});
