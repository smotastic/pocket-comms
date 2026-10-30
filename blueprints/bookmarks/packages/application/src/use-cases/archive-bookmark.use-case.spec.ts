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
const archive = (input: Parameters<BookmarksInbound['Service']['archive']>[0]) =>
  BookmarksInbound.use((inbound) => inbound.archive(input));

describe('BookmarksInbound.archive', () => {
  it.effect('archives a bookmark and increments the version', () =>
    Effect.gen(function* () {
      const created = yield* create;
      const archived = yield* archive({ id: created.id });
      expect(archived).toMatchObject({ status: 'archived', version: 2 });
      const state = yield* FakeState;
      expect(state.bookmarks.get(created.id)).toMatchObject({ status: 'archived', version: 2 });
    }).pipe(Effect.provide(layer)),
  );

  it.effect('returns an archived bookmark unchanged', () =>
    Effect.gen(function* () {
      const created = yield* create;
      const first = yield* archive({ id: created.id });
      const second = yield* archive({ id: created.id });
      expect(second).toEqual(first);
      expect((yield* FakeState).bookmarks.get(created.id)).toMatchObject({ version: 2 });
    }).pipe(Effect.provide(layer)),
  );

  it.effect('checks the expected version when the caller gives one', () =>
    Effect.gen(function* () {
      const created = yield* create;
      const error = yield* archive({ id: created.id, expectedVersion: 7 }).pipe(Effect.flip);
      expect(error).toEqual(new VersionMismatchError({ id: created.id, expected: 7 }));
      expect(yield* archive({ id: created.id, expectedVersion: 1 })).toMatchObject({ version: 2 });
    }).pipe(Effect.provide(layer)),
  );

  it.effect('reports an unknown id as not found', () =>
    Effect.gen(function* () {
      const id = '0192f3a1-7b2c-7d3e-8f40-0000000000ff';
      expect(yield* archive({ id }).pipe(Effect.flip)).toEqual(new BookmarkNotFoundError({ id }));
    }).pipe(Effect.provide(layer)),
  );
});
