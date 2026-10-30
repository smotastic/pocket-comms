import { describe, expect, it } from '@effect/vitest';
import { BookmarksInbound } from '@pocket-comms/bookmarks-application';
import { MAX_TAGS } from '@pocket-comms/bookmarks-contract';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { inMemoryServices } from './composition.js';
import { seedBookmarks } from './examples.js';

const allBookmarks = Effect.gen(function* () {
  const bookmarksInbound = yield* BookmarksInbound;
  const page = yield* bookmarksInbound.list({ status: 'all', limit: 100 });
  return page.items;
});

// The example bookmarks of the local dev commands, which seed on every start.
describe('seedBookmarks', () => {
  const layer = BookmarksInbound.layer.pipe(Layer.provideMerge(inMemoryServices));

  it.effect('adds the examples, one of them archived', () =>
    Effect.gen(function* () {
      const added = yield* seedBookmarks;
      const bookmarks = yield* allBookmarks;

      expect(added).toBe(bookmarks.length);
      expect(bookmarks.length).toBeGreaterThanOrEqual(5);
      expect(bookmarks.filter(({ status }) => status === 'archived')).toHaveLength(1);
      expect(bookmarks.some(({ tags }) => tags.length === 0)).toBe(true);
      expect(bookmarks.some(({ tags }) => tags.length === MAX_TAGS)).toBe(true);
    }).pipe(Effect.provide(layer)),
  );

  it.effect('adds nothing when it runs again', () =>
    Effect.gen(function* () {
      yield* seedBookmarks;
      const before = yield* allBookmarks;

      const added = yield* seedBookmarks;
      const after = yield* allBookmarks;

      expect(added).toBe(0);
      expect(after).toEqual(before);
    }).pipe(Effect.provide(layer)),
  );

  it.effect('brings back a deleted example, archived again', () =>
    Effect.gen(function* () {
      yield* seedBookmarks;
      const bookmarksInbound = yield* BookmarksInbound;
      const [archived] = (yield* allBookmarks).filter(({ status }) => status === 'archived');
      expect(archived).toBeDefined();
      yield* bookmarksInbound.delete({ id: archived?.id ?? '' });

      yield* seedBookmarks;

      expect((yield* allBookmarks).filter(({ status }) => status === 'archived')).toHaveLength(1);
    }).pipe(Effect.provide(layer)),
  );
});
