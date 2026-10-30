import { queryOptions } from '@tanstack/react-query';
import type { BookmarksClient } from './bookmarks-client.js';

/** The key of every cached bookmarks query; a mutation invalidates it to reload the list. */
export const bookmarksKey = ['bookmarks'] as const;

/** The active bookmarks, read through the typed client. */
export const bookmarksQuery = (client: BookmarksClient) =>
  queryOptions({ queryKey: bookmarksKey, queryFn: () => client.list() });
