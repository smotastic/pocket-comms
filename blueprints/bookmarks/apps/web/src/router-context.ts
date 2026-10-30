import type { BookmarksClient } from './bookmarks-client.js';

/** What every route can reach: the typed client of the bookmarks API. */
export interface RouterContext {
  readonly client: BookmarksClient;
}
