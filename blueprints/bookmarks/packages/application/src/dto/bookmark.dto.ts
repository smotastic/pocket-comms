import type { Bookmark } from '@pocket-comms/bookmarks-domain';
import type * as DateTime from 'effect/DateTime';
import type * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

/** What the use cases return. Plain values, so no domain type reaches a driving adapter. */
export const BookmarkDto = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  tags: Schema.Array(Schema.String),
  status: Schema.Literals(['active', 'archived']),
  version: Schema.Int,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
});
export type BookmarkDto = typeof BookmarkDto.Type;

export const CreateBookmarkInput = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
  tags: Schema.Array(Schema.String),
});
export type CreateBookmarkInput = typeof CreateBookmarkInput.Type;

export interface UpdateBookmarkInput {
  readonly id: string;
  /** The version the change is based on; a different current version fails. */
  readonly expectedVersion: number;
  readonly changes: {
    readonly url?: string;
    readonly title?: string;
    readonly tags?: ReadonlyArray<string>;
  };
}

export interface ArchiveBookmarkInput {
  readonly id: string;
  /** When given, the archive fails unless the current version equals it. */
  readonly expectedVersion?: number;
}

export interface DeleteBookmarkInput {
  readonly id: string;
  /** When given, the delete fails unless the current version equals it. */
  readonly expectedVersion?: number;
}

/** Where a list page ends; the next page starts after it. */
export interface ListPositionDto {
  readonly createdAt: DateTime.Utc;
  readonly id: string;
}

export interface ListBookmarksQuery {
  readonly tag?: string;
  readonly status: 'active' | 'archived' | 'all';
  readonly after?: ListPositionDto;
  readonly limit: number;
}

export interface BookmarkPageDto {
  readonly items: ReadonlyArray<BookmarkDto>;
  readonly next: Option.Option<ListPositionDto>;
}

export const toBookmarkDto = (bookmark: Bookmark): BookmarkDto => ({
  id: bookmark.id,
  url: bookmark.url,
  title: bookmark.title,
  tags: bookmark.tags,
  status: bookmark.status,
  version: bookmark.version,
  createdAt: bookmark.createdAt,
  updatedAt: bookmark.updatedAt,
});
