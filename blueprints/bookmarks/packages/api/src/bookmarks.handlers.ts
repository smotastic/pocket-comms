import { BookmarksInbound, type BookmarkDto } from '@pocket-comms/bookmarks-application';
import { BookmarksApi } from '@pocket-comms/bookmarks-contract';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { HttpApiBuilder, HttpApiSchema } from 'effect/http-api';
import { problems } from './problems.js';

const DEFAULT_LIMIT = 20;

/** The strong entity tag of a bookmark version. */
export const etagOf = (version: number) => `"${version}"`;

/** The version in an `If-Match` value; the contract accepts only `"<version>"`. */
export const versionOf = (ifMatch: string) => Number(ifMatch.slice(1, -1));

const withETag = (bookmark: BookmarkDto) =>
  HttpApiSchema.withHeaders({ body: bookmark, headers: { etag: etagOf(bookmark.version) } });

/** Implements the `bookmarks` group; the wire shape equals the application DTO. */
export const bookmarksHandlers = HttpApiBuilder.group(
  BookmarksApi,
  'bookmarks',
  Effect.fn(function* (handlers) {
    const bookmarksInbound = yield* BookmarksInbound;

    return handlers
      .handle('create', ({ payload }) =>
        bookmarksInbound.create(payload).pipe(
          Effect.map((bookmark) =>
            HttpApiSchema.withHeaders({
              body: bookmark,
              headers: {
                etag: etagOf(bookmark.version),
                location: `/api/v1/bookmarks/${bookmark.id}`,
              },
            }),
          ),
          Effect.catchTags({
            InvalidBookmarkError: problems.invalidBookmark,
            UrlAlreadyUsedError: problems.urlAlreadyUsed,
          }),
        ),
      )
      .handle('list', ({ query }) =>
        bookmarksInbound
          .list({
            ...(query.tag === undefined ? {} : { tag: query.tag }),
            ...(query.cursor === undefined ? {} : { after: query.cursor }),
            status: query.status ?? 'active',
            limit: query.limit ?? DEFAULT_LIMIT,
          })
          .pipe(
            Effect.map((page) => ({
              items: page.items,
              ...Option.match(page.next, { onNone: () => ({}), onSome: (next) => ({ next }) }),
            })),
            Effect.catchTags({ InvalidBookmarkError: problems.invalidBookmark }),
          ),
      )
      .handle('update', ({ params, headers, payload }) => {
        const ifMatch = headers['if-match'];
        if (ifMatch === undefined) return problems.ifMatchRequired();
        return bookmarksInbound
          .update({ id: params.id, expectedVersion: versionOf(ifMatch), changes: payload })
          .pipe(
            Effect.map(withETag),
            Effect.catchTags({
              BookmarkNotFoundError: problems.bookmarkNotFound,
              VersionMismatchError: problems.versionMismatch,
              BookmarkArchivedError: problems.bookmarkArchived,
              InvalidBookmarkError: problems.invalidBookmark,
              UrlAlreadyUsedError: problems.urlAlreadyUsed,
            }),
          );
      })
      .handle('archive', ({ params, headers }) => {
        const ifMatch = headers['if-match'];
        return bookmarksInbound
          .archive({
            id: params.id,
            ...(ifMatch === undefined ? {} : { expectedVersion: versionOf(ifMatch) }),
          })
          .pipe(
            Effect.map(withETag),
            Effect.catchTags({
              BookmarkNotFoundError: problems.bookmarkNotFound,
              VersionMismatchError: problems.versionMismatch,
            }),
          );
      })
      .handle('delete', ({ params, headers }) => {
        const ifMatch = headers['if-match'];
        return bookmarksInbound
          .delete({
            id: params.id,
            ...(ifMatch === undefined ? {} : { expectedVersion: versionOf(ifMatch) }),
          })
          .pipe(
            Effect.catchTags({
              BookmarkNotFoundError: problems.bookmarkNotFound,
              VersionMismatchError: problems.versionMismatch,
            }),
          );
      })
      .handle('get', ({ params }) =>
        bookmarksInbound
          .get(params.id)
          .pipe(
            Effect.map(withETag),
            Effect.catchTags({ BookmarkNotFoundError: problems.bookmarkNotFound }),
          ),
      );
  }),
);
