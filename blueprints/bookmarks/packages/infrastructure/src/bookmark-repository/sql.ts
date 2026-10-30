import {
  BookmarkNotFoundError,
  BookmarkRepositoryOutbound,
  UrlAlreadyUsedError,
  VersionMismatchError,
} from '@pocket-comms/bookmarks-application';
import type { Bookmark, BookmarkId, Version } from '@pocket-comms/bookmarks-domain';
import { BookmarkRow, fromBookmark, toBookmark } from '../persistence/index.js';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { PgTypes } from '@effect/sql-pg';
import * as Result from 'effect/Result';
import { SqlClient, type SqlError } from 'effect/sql';
import { positionOf } from './order.js';

const decodeRows = Schema.decodeUnknownEffect(Schema.Array(BookmarkRow));

// A row that does not decode, or a database failure other than the expected conflicts, is a
// defect: the use cases cannot act on it (ADR 0004).
const toBookmarks = (rows: ReadonlyArray<unknown>) =>
  Effect.flatMap(decodeRows(rows), (decoded) => Effect.forEach(decoded, toBookmark)).pipe(
    Effect.orDie,
  );

// The driver cannot infer the element type of an empty array, so tags always bind as `text[]`.
const tagsParameter = (tags: ReadonlyArray<string>) =>
  Result.getOrThrow(PgTypes.array(tags, PgTypes.OID.text));

const columnsOf = (bookmark: Bookmark) => {
  const row = fromBookmark(bookmark);
  return { ...row, tags: tagsParameter(row.tags) };
};

// The unique key on `url` from migration 0001. Any other unique violation (a duplicate id) is a
// defect, not a conflict the caller can resolve.
const URL_CONSTRAINT = 'bookmarks_url_key';

const urlConflict =
  (url: string) =>
  <A, R>(effect: Effect.Effect<A, SqlError.SqlError, R>) =>
    effect.pipe(
      Effect.catchReason('SqlError', 'UniqueViolation', (reason, error) =>
        reason.constraint === URL_CONSTRAINT
          ? Effect.fail(new UrlAlreadyUsedError({ url }))
          : Effect.die(error),
      ),
    );

/** The repository on PostgreSQL, in the table `bookmarks.bookmarks` of migration 0001. */
export const layerSql = Layer.effect(
  BookmarkRepositoryOutbound,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const findById = Effect.fn('BookmarkRepository.findById')(function* (id: BookmarkId) {
      const rows = yield* sql`SELECT * FROM bookmarks.bookmarks WHERE id = ${id}`.pipe(
        Effect.orDie,
      );
      const [bookmark] = yield* toBookmarks(rows);
      if (bookmark === undefined) return yield* new BookmarkNotFoundError({ id });
      return bookmark;
    });

    // Tells a missing bookmark from a stale version after a write matched no row.
    const noRowMatched = (id: BookmarkId, expected: Version) =>
      Effect.flatMap(findById(id), () => Effect.fail(new VersionMismatchError({ id, expected })));

    const insert = Effect.fn('BookmarkRepository.insert')(function* (bookmark: Bookmark) {
      yield* sql`INSERT INTO bookmarks.bookmarks ${sql.insert(columnsOf(bookmark))}`.pipe(
        urlConflict(bookmark.url),
        Effect.catchTag('SqlError', Effect.die),
      );
    });

    const update = Effect.fn('BookmarkRepository.update')(function* (
      bookmark: Bookmark,
      expected: Version,
    ) {
      const { id, ...columns } = columnsOf(bookmark);
      const rows = yield* sql`
        UPDATE bookmarks.bookmarks SET ${sql.update(columns)}
        WHERE id = ${id} AND version = ${expected}
        RETURNING id
      `.pipe(urlConflict(bookmark.url), Effect.catchTag('SqlError', Effect.die));
      if (rows.length === 0) return yield* noRowMatched(bookmark.id, expected);
    });

    const remove = Effect.fn('BookmarkRepository.delete')(function* (
      id: BookmarkId,
      expected: Option.Option<Version>,
    ) {
      const versionMatches = Option.match(expected, {
        onNone: () => sql`TRUE`,
        onSome: (version) => sql`version = ${version}`,
      });
      const rows = yield* sql<{ version: Version }>`
        DELETE FROM bookmarks.bookmarks WHERE id = ${id} AND ${versionMatches}
        RETURNING version
      `.pipe(Effect.orDie);
      const [deleted] = rows;
      if (deleted !== undefined) return deleted.version;
      return yield* Option.match(expected, {
        onNone: () => Effect.fail(new BookmarkNotFoundError({ id })),
        onSome: (version) => noRowMatched(id, version),
      });
    });

    const list = Effect.fn('BookmarkRepository.list')(function* (
      query: Parameters<BookmarkRepositoryOutbound['Service']['list']>[0],
    ) {
      const conditions = [
        ...(query.status === 'all' ? [] : [sql`status = ${query.status}`]),
        ...Option.match(query.tag, {
          onNone: () => [],
          onSome: (tag) => [sql`${tag} = ANY (tags)`],
        }),
        ...Option.match(query.after, {
          onNone: () => [],
          onSome: (after) => [
            sql`(created_at, id) < (${DateTime.toDate(after.createdAt)}, ${after.id})`,
          ],
        }),
      ];
      // One row more than the page tells whether another page follows.
      const rows = yield* sql`
        SELECT * FROM bookmarks.bookmarks
        WHERE ${sql.and(conditions.length === 0 ? [sql`TRUE`] : conditions)}
        ORDER BY created_at DESC, id DESC
        LIMIT ${query.limit + 1}
      `.pipe(Effect.orDie);
      const bookmarks = yield* toBookmarks(rows);
      const items = bookmarks.slice(0, query.limit);
      const last = items.at(-1);
      return {
        items,
        next:
          bookmarks.length > query.limit && last !== undefined
            ? Option.some(positionOf(last))
            : Option.none(),
      };
    });

    return BookmarkRepositoryOutbound.of({ findById, insert, update, delete: remove, list });
  }),
);
