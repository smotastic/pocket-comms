import { describe, expect, it } from '@effect/vitest';
import {
  archiveBookmark,
  BookmarkArchivedError,
  InvalidBookmarkError,
} from '@pocket-comms/bookmarks-domain';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { TestClock } from 'effect/testing';
import { BookmarkNotFoundError, UrlAlreadyUsedError, VersionMismatchError } from '../errors.js';
import { BookmarksInbound } from '../ports/bookmark.inbound.port.js';
import { FakeState, fakeLayer } from '../testing/fakes.js';

const layer = BookmarksInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const later = DateTime.makeUnsafe('2026-09-29T09:00:00Z');

const create = (url = 'https://effect.website') =>
  BookmarksInbound.use((inbound) => inbound.create({ url, title: 'Effect', tags: ['docs'] }));

const update = (input: Parameters<BookmarksInbound['Service']['update']>[0]) =>
  BookmarksInbound.use((inbound) => inbound.update(input));

const failedFields = (error: unknown) =>
  error instanceof InvalidBookmarkError ? error.issues.map((issue) => issue.field) : [];

describe('BookmarksInbound.update', () => {
  it.effect('applies the changes and increments the version', () =>
    Effect.gen(function* () {
      const created = yield* create();
      yield* TestClock.setTime(DateTime.toEpochMillis(later));
      const updated = yield* update({
        id: created.id,
        expectedVersion: 1,
        changes: { title: 'New' },
      });
      expect(updated).toMatchObject({ title: 'New', version: 2, updatedAt: later });
      const state = yield* FakeState;
      expect(state.bookmarks.get(created.id)).toMatchObject({ title: 'New', version: 2 });
    }).pipe(Effect.provide(layer)),
  );

  it.effect('rejects a stale expected version and changes nothing', () =>
    Effect.gen(function* () {
      const created = yield* create();
      yield* update({ id: created.id, expectedVersion: 1, changes: { title: 'Second' } });
      const error = yield* update({
        id: created.id,
        expectedVersion: 1,
        changes: { title: 'Stale' },
      }).pipe(Effect.flip);
      expect(error).toEqual(new VersionMismatchError({ id: created.id, expected: 1 }));
      const state = yield* FakeState;
      expect(state.bookmarks.get(created.id)).toMatchObject({ title: 'Second', version: 2 });
    }).pipe(Effect.provide(layer)),
  );

  it.effect('rejects a change of an archived bookmark', () =>
    Effect.gen(function* () {
      const created = yield* create();
      const state = yield* FakeState;
      const stored = state.bookmarks.get(created.id);
      if (stored === undefined) throw new Error('The bookmark was not stored');
      const archived = archiveBookmark({ bookmark: stored, now: later });
      state.bookmarks.set(created.id, archived);
      const error = yield* update({
        id: created.id,
        expectedVersion: archived.version,
        changes: { title: 'New' },
      }).pipe(Effect.flip);
      expect(error).toBeInstanceOf(BookmarkArchivedError);
    }).pipe(Effect.provide(layer)),
  );

  it.effect('returns the bookmark unchanged, without a new version, when nothing changes', () =>
    Effect.gen(function* () {
      const created = yield* create();
      const result = yield* update({
        id: created.id,
        expectedVersion: 1,
        changes: { title: 'Effect' },
      });
      expect(result).toEqual(created);
      expect((yield* FakeState).bookmarks.get(created.id)).toMatchObject({ version: 1 });
    }).pipe(Effect.provide(layer)),
  );

  it.effect('rejects invalid changes naming every failed field', () =>
    Effect.gen(function* () {
      const created = yield* create();
      const error = yield* update({
        id: created.id,
        expectedVersion: 1,
        changes: { url: '/x', tags: ['A'] },
      }).pipe(Effect.flip);
      expect(error).toBeInstanceOf(InvalidBookmarkError);
      expect(failedFields(error)).toEqual(['url', 'tags']);
    }).pipe(Effect.provide(layer)),
  );

  it.effect('rejects a URL that another bookmark uses', () =>
    Effect.gen(function* () {
      yield* create('https://a.example');
      const second = yield* create('https://b.example');
      const error = yield* update({
        id: second.id,
        expectedVersion: 1,
        changes: { url: 'https://a.example' },
      }).pipe(Effect.flip);
      expect(error).toEqual(new UrlAlreadyUsedError({ url: 'https://a.example' }));
    }).pipe(Effect.provide(layer)),
  );

  it.effect('reports an unknown id as not found', () =>
    Effect.gen(function* () {
      const id = '0192f3a1-7b2c-7d3e-8f40-0000000000ff';
      const error = yield* update({ id, expectedVersion: 1, changes: {} }).pipe(Effect.flip);
      expect(error).toEqual(new BookmarkNotFoundError({ id }));
    }).pipe(Effect.provide(layer)),
  );
});
