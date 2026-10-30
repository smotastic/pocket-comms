import { Bookmark } from '@pocket-comms/bookmarks-domain';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/** A row of `bookmarks.bookmarks` as the PostgreSQL driver returns it. */
export const BookmarkRow = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  tags: Schema.Array(Schema.String),
  status: Schema.String,
  version: Schema.Int,
  created_at: Schema.Date,
  updated_at: Schema.Date,
});
export type BookmarkRow = typeof BookmarkRow.Type;

const decodeBookmark = Schema.decodeUnknownEffect(Bookmark);

/** Decodes a row through the domain schema, so a row that breaks a domain rule fails here. */
export const toBookmark = (row: BookmarkRow) =>
  decodeBookmark({
    id: row.id,
    url: row.url,
    title: row.title,
    tags: row.tags,
    status: row.status,
    version: row.version,
    createdAt: DateTime.fromDateUnsafe(row.created_at),
    updatedAt: DateTime.fromDateUnsafe(row.updated_at),
  }).pipe(Effect.withSpan('BookmarkRow.toBookmark'));

/** The column values of a bookmark, for inserts and updates. */
export const fromBookmark = (bookmark: Bookmark): BookmarkRow => ({
  id: bookmark.id,
  url: bookmark.url,
  title: bookmark.title,
  tags: [...bookmark.tags],
  status: bookmark.status,
  version: bookmark.version,
  created_at: DateTime.toDate(bookmark.createdAt),
  updated_at: DateTime.toDate(bookmark.updatedAt),
});
