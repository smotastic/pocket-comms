import { BookmarksInbound, type CreateBookmarkInput } from '@pocket-comms/bookmarks-application';
import * as Effect from 'effect/Effect';

// Example bookmarks for local development only; `serve` never adds them. They go through the use
// cases, so the domain rules apply, and they cover the states the web app shows.

interface Example extends CreateBookmarkInput {
  readonly archived?: boolean;
}

// As many tags as a bookmark may have; the seed test checks that it matches the domain limit.
const tenTags = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

const EXAMPLES: ReadonlyArray<Example> = [
  { url: 'https://effect.website/docs', title: 'Effect documentation', tags: ['effect', 'docs'] },
  { url: 'https://nx.dev/docs', title: 'Nx documentation', tags: [] },
  { url: 'https://vite.dev/guide/', title: 'Vite guide', tags: tenTags },
  {
    url: 'https://www.postgresql.org/docs/17/index.html',
    title:
      'PostgreSQL 17 documentation, with a title long enough to show how the list wraps a heading',
    tags: ['database', 'docs'],
  },
  { url: 'https://react.dev/learn', title: 'Learn React', tags: ['docs', 'frontend'] },
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
    title: 'HTTP on MDN',
    tags: ['web'],
    archived: true,
  },
];

/**
 * Adds the examples whose URL is still free and returns how many it added. An example that exists
 * already is left as it is, so the seed can run on every start.
 */
export const seedBookmarks = Effect.gen(function* () {
  const bookmarksInbound = yield* BookmarksInbound;
  let added = 0;
  for (const { archived, ...input } of EXAMPLES) {
    const bookmark = yield* bookmarksInbound.create(input).pipe(
      Effect.catchTag('UrlAlreadyUsedError', () => Effect.succeed(undefined)),
      Effect.orDie,
    );
    if (bookmark === undefined) continue;
    added += 1;
    if (archived) yield* bookmarksInbound.archive({ id: bookmark.id }).pipe(Effect.orDie);
  }
  return added;
});
