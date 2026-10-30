import type { BookmarkArchivedError, InvalidBookmarkError } from '@pocket-comms/bookmarks-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type {
  ArchiveBookmarkInput,
  BookmarkDto,
  BookmarkPageDto,
  CreateBookmarkInput,
  DeleteBookmarkInput,
  ListBookmarksQuery,
  UpdateBookmarkInput,
} from '../dto/bookmark.dto.js';
import type {
  BookmarkNotFoundError,
  UrlAlreadyUsedError,
  VersionMismatchError,
} from '../errors.js';
import { makeArchiveBookmark } from '../use-cases/archive-bookmark.use-case.js';
import { makeDeleteBookmark } from '../use-cases/delete-bookmark.use-case.js';
import { makeCreateBookmark } from '../use-cases/create-bookmark.use-case.js';
import { makeGetBookmark } from '../use-cases/get-bookmark.use-case.js';
import { makeListBookmarks } from '../use-cases/list-bookmarks.use-case.js';
import { makeUpdateBookmark } from '../use-cases/update-bookmark.use-case.js';

// The one inbound port of the bookmark resource (ADR 0006). Each method is one use case, and the
// `layer` joins the use cases of `use-cases/`.

export class BookmarksInbound extends Context.Service<
  BookmarksInbound,
  {
    readonly create: (
      input: CreateBookmarkInput,
    ) => Effect.Effect<BookmarkDto, InvalidBookmarkError | UrlAlreadyUsedError>;
    readonly get: (id: string) => Effect.Effect<BookmarkDto, BookmarkNotFoundError>;
    readonly list: (
      query: ListBookmarksQuery,
    ) => Effect.Effect<BookmarkPageDto, InvalidBookmarkError>;
    readonly update: (
      input: UpdateBookmarkInput,
    ) => Effect.Effect<
      BookmarkDto,
      | BookmarkNotFoundError
      | VersionMismatchError
      | BookmarkArchivedError
      | InvalidBookmarkError
      | UrlAlreadyUsedError
    >;
    readonly archive: (
      input: ArchiveBookmarkInput,
    ) => Effect.Effect<BookmarkDto, BookmarkNotFoundError | VersionMismatchError>;
    readonly delete: (
      input: DeleteBookmarkInput,
    ) => Effect.Effect<void, BookmarkNotFoundError | VersionMismatchError>;
  }
>()('bookmarks/application/BookmarksInbound') {
  static readonly layer = Layer.effect(
    BookmarksInbound,
    Effect.gen(function* () {
      return {
        ...(yield* makeCreateBookmark),
        ...(yield* makeGetBookmark),
        ...(yield* makeListBookmarks),
        ...(yield* makeUpdateBookmark),
        ...(yield* makeArchiveBookmark),
        ...(yield* makeDeleteBookmark),
      };
    }),
  );
}
