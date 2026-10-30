import { describe, expect, type Vitest } from '@effect/vitest';
import {
  BookmarkNotFoundError,
  BookmarkRepositoryOutbound,
  UrlAlreadyUsedError,
  VersionMismatchError,
  type ListQuery,
} from '@pocket-comms/bookmarks-application';
import {
  archiveBookmark,
  BookmarkId,
  changeBookmark,
  createBookmark,
  Tag,
  type Bookmark,
} from '@pocket-comms/bookmarks-domain';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import type * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';

const start = DateTime.toEpochMillis(DateTime.makeUnsafe('2026-09-29T08:00:00Z'));
const idOf = (n: number) =>
  BookmarkId.make(`0192f3a1-7b2c-7d3e-8f40-${n.toString(16).padStart(12, '0')}`);

/** Bookmark `n` is created `n` minutes after the start, so a higher `n` is newer. */
export const bookmarkFixture = (n: number, tags: ReadonlyArray<string> = []): Bookmark =>
  Result.getOrThrow(
    createBookmark({
      id: idOf(n),
      input: { url: `https://example.com/${n}`, title: `Bookmark ${n}`, tags },
      now: DateTime.makeUnsafe(start + n * 60_000),
    }),
  );

const changed = (bookmark: Bookmark, input: { url?: string; title?: string }) =>
  Result.getOrThrow(
    changeBookmark({
      bookmark,
      input,
      now: DateTime.makeUnsafe(start + 3_600_000),
    }),
  );

const query = (overrides: Partial<ListQuery> = {}): ListQuery => ({
  tag: Option.none(),
  status: 'active',
  after: Option.none(),
  limit: 20,
  ...overrides,
});

const ids = (bookmarks: ReadonlyArray<Bookmark>) => bookmarks.map((bookmark) => bookmark.id);

/**
 * The behaviour every `BookmarkRepositoryOutbound` adapter shares. Each test provides `layer`
 * anew, so the layer must start from an empty store. `it` supplies what the layer needs, for
 * example a database from the `layer` helper of `@effect/vitest`.
 */
export const repositoryContract = <R>(
  name: string,
  layer: Layer.Layer<BookmarkRepositoryOutbound, unknown, R>,
  it: Vitest.MethodsNonLive<R>,
) =>
  describe(`${name} (repository contract)`, () => {
    const test = (title: string, body: Effect.Effect<void, unknown, BookmarkRepositoryOutbound>) =>
      it.effect(title, () => Effect.provide(body, layer));

    const insertAll = (bookmarks: ReadonlyArray<Bookmark>) =>
      Effect.gen(function* () {
        const repository = yield* BookmarkRepositoryOutbound;
        yield* Effect.forEach(bookmarks, repository.insert, { discard: true });
        return repository;
      });

    test(
      'finds an inserted bookmark by id',
      Effect.gen(function* () {
        const bookmark = bookmarkFixture(1, ['docs']);
        const repository = yield* insertAll([bookmark]);
        expect(yield* repository.findById(bookmark.id)).toEqual(bookmark);
      }),
    );

    test(
      'fails to find an unknown id',
      Effect.gen(function* () {
        const repository = yield* BookmarkRepositoryOutbound;
        const error = yield* repository.findById(idOf(99)).pipe(Effect.flip);
        expect(error).toEqual(new BookmarkNotFoundError({ id: idOf(99) }));
      }),
    );

    test(
      'rejects a second bookmark with the same URL, also when the first is archived',
      Effect.gen(function* () {
        const first = bookmarkFixture(1);
        const repository = yield* insertAll([first]);
        yield* repository.update(
          archiveBookmark({ bookmark: first, now: first.updatedAt }),
          first.version,
        );
        const duplicate = { ...bookmarkFixture(2), url: first.url };
        const error = yield* repository.insert(duplicate).pipe(Effect.flip);
        expect(error).toEqual(new UrlAlreadyUsedError({ url: first.url }));
      }),
    );

    test(
      'updates a bookmark while the expected version is current',
      Effect.gen(function* () {
        const bookmark = bookmarkFixture(1);
        const repository = yield* insertAll([bookmark]);
        const next = changed(bookmark, { title: 'New title' });
        yield* repository.update(next, bookmark.version);
        expect(yield* repository.findById(bookmark.id)).toEqual(next);
      }),
    );

    test(
      'rejects an update with a stale expected version and keeps the stored bookmark',
      Effect.gen(function* () {
        const bookmark = bookmarkFixture(1);
        const repository = yield* insertAll([bookmark]);
        const second = changed(bookmark, { title: 'Second' });
        yield* repository.update(second, bookmark.version);
        const error = yield* repository
          .update(changed(bookmark, { title: 'Stale' }), bookmark.version)
          .pipe(Effect.flip);
        expect(error).toEqual(new VersionMismatchError({ id: bookmark.id, expected: 1 }));
        expect(yield* repository.findById(bookmark.id)).toEqual(second);
      }),
    );

    test(
      'rejects an update of an unknown bookmark',
      Effect.gen(function* () {
        const repository = yield* BookmarkRepositoryOutbound;
        const bookmark = bookmarkFixture(1);
        const error = yield* repository.update(bookmark, bookmark.version).pipe(Effect.flip);
        expect(error).toEqual(new BookmarkNotFoundError({ id: bookmark.id }));
      }),
    );

    test(
      'rejects an update to a URL that another bookmark uses',
      Effect.gen(function* () {
        const [first, second] = [bookmarkFixture(1), bookmarkFixture(2)];
        const repository = yield* insertAll([first, second]);
        const error = yield* repository
          .update(changed(second, { url: first.url }), second.version)
          .pipe(Effect.flip);
        expect(error).toEqual(new UrlAlreadyUsedError({ url: first.url }));
      }),
    );

    test(
      'deletes a bookmark, with or without an expected version',
      Effect.gen(function* () {
        const [first, second] = [bookmarkFixture(1), bookmarkFixture(2)];
        const repository = yield* insertAll([first, second]);
        expect(yield* repository.delete(first.id, Option.none())).toBe(1);
        expect(yield* repository.delete(second.id, Option.some(second.version))).toBe(1);
        expect(yield* repository.findById(first.id).pipe(Effect.flip)).toBeInstanceOf(
          BookmarkNotFoundError,
        );
        expect((yield* repository.list(query({ status: 'all' }))).items).toEqual([]);
      }),
    );

    test(
      'rejects a delete with a stale expected version or an unknown id',
      Effect.gen(function* () {
        const bookmark = bookmarkFixture(1);
        const repository = yield* insertAll([bookmark]);
        const stale = yield* repository
          .delete(bookmark.id, Option.some(changed(bookmark, { title: 'x' }).version))
          .pipe(Effect.flip);
        expect(stale).toEqual(new VersionMismatchError({ id: bookmark.id, expected: 2 }));
        const unknown = yield* repository.delete(idOf(99), Option.none()).pipe(Effect.flip);
        expect(unknown).toEqual(new BookmarkNotFoundError({ id: idOf(99) }));
      }),
    );

    test(
      'lists newest first and filters by status',
      Effect.gen(function* () {
        const bookmarks = [1, 2, 3].map((n) => bookmarkFixture(n));
        const repository = yield* insertAll(bookmarks);
        const [first] = bookmarks as [Bookmark];
        yield* repository.update(
          archiveBookmark({ bookmark: first, now: first.updatedAt }),
          first.version,
        );
        expect(ids((yield* repository.list(query())).items)).toEqual([idOf(3), idOf(2)]);
        expect(ids((yield* repository.list(query({ status: 'archived' }))).items)).toEqual([
          idOf(1),
        ]);
        expect(ids((yield* repository.list(query({ status: 'all' }))).items)).toEqual([
          idOf(3),
          idOf(2),
          idOf(1),
        ]);
      }),
    );

    test(
      'filters by one tag',
      Effect.gen(function* () {
        const repository = yield* insertAll([
          bookmarkFixture(1, ['docs', 'effect']),
          bookmarkFixture(2, ['effect']),
          bookmarkFixture(3, ['docs']),
        ]);
        const page = yield* repository.list(query({ tag: Option.some(Tag.make('docs')) }));
        expect(ids(page.items)).toEqual([idOf(3), idOf(1)]);
      }),
    );

    test(
      'pages with the position of the last item until no bookmark follows',
      Effect.gen(function* () {
        const repository = yield* insertAll(
          Array.from({ length: 25 }, (_, i) => bookmarkFixture(i + 1)),
        );
        const first = yield* repository.list(query({ limit: 10 }));
        expect(ids(first.items)).toEqual(Array.from({ length: 10 }, (_, i) => idOf(25 - i)));
        const second = yield* repository.list(query({ limit: 10, after: first.next }));
        expect(ids(second.items)).toEqual(Array.from({ length: 10 }, (_, i) => idOf(15 - i)));
        const last = yield* repository.list(query({ limit: 10, after: second.next }));
        expect(ids(last.items)).toEqual(Array.from({ length: 5 }, (_, i) => idOf(5 - i)));
        expect(last.next).toEqual(Option.none());
      }),
    );

    test(
      'orders bookmarks created at the same time by id, highest id first',
      Effect.gen(function* () {
        const low = bookmarkFixture(1);
        const high = { ...bookmarkFixture(2), createdAt: low.createdAt, updatedAt: low.updatedAt };
        const repository = yield* insertAll([high, low]);
        const first = yield* repository.list(query({ limit: 1 }));
        expect(ids(first.items)).toEqual([high.id]);
        const second = yield* repository.list(query({ limit: 1, after: first.next }));
        expect(ids(second.items)).toEqual([low.id]);
        expect(second.next).toEqual(Option.none());
      }),
    );

    test(
      'pages by creation time first, also when the id order is the reverse',
      Effect.gen(function* () {
        // The older bookmark has the higher id, so only a (createdAt, id) tuple comparison keeps
        // it on the next page.
        const older = { ...bookmarkFixture(3), createdAt: bookmarkFixture(1).createdAt };
        const newer = { ...bookmarkFixture(2), createdAt: bookmarkFixture(2).createdAt };
        const repository = yield* insertAll([older, newer]);
        const first = yield* repository.list(query({ limit: 1 }));
        expect(ids(first.items)).toEqual([newer.id]);
        const second = yield* repository.list(query({ limit: 1, after: first.next }));
        expect(ids(second.items)).toEqual([older.id]);
      }),
    );

    test(
      'returns no next position when the last page is exactly full, also with a filter',
      Effect.gen(function* () {
        const repository = yield* insertAll(
          Array.from({ length: 30 }, (_, i) => bookmarkFixture(i + 1, i % 3 === 0 ? ['docs'] : [])),
        );
        const docs = query({ tag: Option.some(Tag.make('docs')), limit: 5 });
        const first = yield* repository.list(docs);
        expect(first.items).toHaveLength(5);
        const second = yield* repository.list({ ...docs, after: first.next });
        expect(second.items).toHaveLength(5);
        expect(second.next).toEqual(Option.none());
      }),
    );
  });
