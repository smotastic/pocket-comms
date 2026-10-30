import { BookmarksApi, type Bookmark } from '@pocket-comms/bookmarks-contract';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';

export type BookmarkView = typeof Bookmark.Type;

export interface NewBookmark {
  readonly url: string;
  readonly title: string;
  readonly tags: ReadonlyArray<string>;
}

/**
 * What the components need from the API, as plain promises. Tests pass a fake; the app passes
 * `makeBookmarksClient`.
 */
export interface BookmarksClient {
  readonly list: () => Promise<ReadonlyArray<BookmarkView>>;
  readonly create: (input: NewBookmark) => Promise<BookmarkView>;
  readonly archive: (bookmark: BookmarkView) => Promise<BookmarkView>;
  readonly remove: (bookmark: BookmarkView) => Promise<void>;
}

// A Problem Details response carries a readable `detail`; anything else falls back to its message.
const messageOf = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    if ('detail' in error && typeof error.detail === 'string') return error.detail;
    if ('title' in error && typeof error.title === 'string') return error.title;
    if ('message' in error && typeof error.message === 'string') return error.message;
  }
  return 'The request failed.';
};

const ifMatch = (bookmark: BookmarkView) => ({ 'if-match': `"${bookmark.version}"` });

/** The typed client of the bookmarks contract (ADR 0008), served under `baseUrl`. */
export const makeBookmarksClient = (baseUrl: string): BookmarksClient => {
  const client = HttpApiClient.make(BookmarksApi, { baseUrl });
  type Client = Effect.Success<typeof client>;

  const run = async <A, E>(request: (api: Client) => Effect.Effect<A, E>): Promise<A> => {
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(client, request).pipe(Effect.provide(FetchHttpClient.layer)),
    );
    if (Exit.isSuccess(exit)) return exit.value;
    throw new Error(messageOf(Cause.squash(exit.cause)));
  };

  return {
    list: () => run((api) => api.bookmarks.list({ query: {} })).then((page) => page.items),
    create: (input) =>
      run((api) => api.bookmarks.create({ payload: input })).then((response) => response.body),
    archive: (bookmark) =>
      run((api) =>
        api.bookmarks.archive({ params: { id: bookmark.id }, headers: ifMatch(bookmark) }),
      ).then((response) => response.body),
    remove: (bookmark) =>
      run((api) =>
        api.bookmarks.delete({ params: { id: bookmark.id }, headers: ifMatch(bookmark) }),
      ).then(() => undefined),
  };
};
