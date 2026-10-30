import type {
  Bookmark,
  BookmarkId,
  BookmarkStatus,
  Tag,
  Version,
} from '@pocket-comms/bookmarks-domain';
import * as Context from 'effect/Context';
import type * as DateTime from 'effect/DateTime';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type {
  BookmarkNotFoundError,
  UrlAlreadyUsedError,
  VersionMismatchError,
} from '../errors.js';

/** The position of a bookmark in the newest-first order; the list continues after it. */
export interface ListPosition {
  readonly createdAt: DateTime.Utc;
  readonly id: BookmarkId;
}

export interface ListQuery {
  readonly tag: Option.Option<Tag>;
  readonly status: BookmarkStatus | 'all';
  readonly after: Option.Option<ListPosition>;
  readonly limit: number;
}

export interface BookmarkPage {
  readonly items: ReadonlyArray<Bookmark>;
  /** The position of the last item, when more bookmarks follow it. */
  readonly next: Option.Option<ListPosition>;
}

export class BookmarkRepositoryOutbound extends Context.Service<
  BookmarkRepositoryOutbound,
  {
    readonly findById: (id: BookmarkId) => Effect.Effect<Bookmark, BookmarkNotFoundError>;
    readonly insert: (bookmark: Bookmark) => Effect.Effect<void, UrlAlreadyUsedError>;
    /** Stores `bookmark` only while the stored version still equals `expected`. */
    readonly update: (
      bookmark: Bookmark,
      expected: Version,
    ) => Effect.Effect<void, BookmarkNotFoundError | UrlAlreadyUsedError | VersionMismatchError>;
    /** Deletes `id`, when `expected` is given only at that version, and returns the version it had. */
    readonly delete: (
      id: BookmarkId,
      expected: Option.Option<Version>,
    ) => Effect.Effect<Version, BookmarkNotFoundError | VersionMismatchError>;
    readonly list: (query: ListQuery) => Effect.Effect<BookmarkPage>;
  }
>()('bookmarks/application/BookmarkRepositoryOutbound') {}

export class IdGeneratorOutbound extends Context.Service<
  IdGeneratorOutbound,
  { readonly next: Effect.Effect<BookmarkId> }
>()('bookmarks/application/IdGeneratorOutbound') {}
