import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import * as DateTime from 'effect/DateTime';
import type { BookmarkView, BookmarksClient, NewBookmark } from './bookmarks-client.js';
import { createAppRouter } from './router.js';

const now = DateTime.makeUnsafe('2026-09-29T08:00:00Z');

/** An in-memory stand-in for the API that keeps only active bookmarks, newest first. */
export const fakeClient = (initial: ReadonlyArray<NewBookmark> = []): BookmarksClient => {
  let stored: Array<BookmarkView> = [];
  let next = 0;
  const add = (input: NewBookmark): BookmarkView => {
    const bookmark: BookmarkView = {
      ...input,
      tags: [...input.tags],
      id: `0192f3a1-7b2c-7d3e-8f40-${String(++next).padStart(12, '0')}`,
      status: 'active',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    stored = [bookmark, ...stored];
    return bookmark;
  };
  initial.forEach(add);
  return {
    list: async () => stored,
    create: async (input) => {
      if (stored.some((bookmark) => bookmark.url === input.url)) {
        throw new Error(`Another bookmark already has the URL ${input.url}.`);
      }
      return add(input);
    },
    archive: async (bookmark) => {
      stored = stored.filter((b) => b.id !== bookmark.id);
      return { ...bookmark, status: 'archived', version: bookmark.version + 1 };
    },
    remove: async (bookmark) => {
      stored = stored.filter((b) => b.id !== bookmark.id);
    },
  };
};

/**
 * Renders the whole app at `path` with `client`, through the router and a fresh query cache that
 * does not retry, so a failed request shows at once.
 */
export const renderApp = ({
  client,
  path = '/',
}: {
  readonly client: BookmarksClient;
  readonly path?: string;
}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter({
    client,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
};
