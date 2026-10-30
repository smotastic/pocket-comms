import { describe, expect, it } from '@effect/vitest';
import { validationMiddlewareLayer } from '@pocket-comms/backend-shared/http';
import { BookmarkNotFoundError, BookmarksInbound } from '@pocket-comms/bookmarks-application';
import { BookmarksApi } from '@pocket-comms/bookmarks-contract';
import { NotFoundProblem } from '@pocket-comms/contracts-problem-details';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { HttpServer } from 'effect/http';
import { HttpApiTest } from 'effect/http-api';
import { bookmarksHandlers } from './bookmarks.handlers.js';

const unknownId = '0192f3a1-7b2c-7d3e-8f40-0000000000ff';

// `Layer.mock` gets only the methods that the test calls; a method that is not given fails with a
// defect when it is called (ADR 0006). The handlers run without the use cases and their ports.
const withInbound = (inbound: Partial<BookmarksInbound['Service']>) =>
  bookmarksHandlers.pipe(
    Layer.provide(Layer.mock(BookmarksInbound, inbound)),
    Layer.provideMerge(validationMiddlewareLayer),
    Layer.provideMerge(HttpServer.layerServices),
  );

describe('bookmarksHandlers', () => {
  it.effect('answers a BookmarkNotFoundError of get with a 404 problem', () =>
    Effect.gen(function* () {
      const { bookmarks } = yield* HttpApiTest.groups(BookmarksApi, ['bookmarks']);
      const error = yield* bookmarks.get({ params: { id: unknownId } }).pipe(Effect.flip);
      expect(error).toBeInstanceOf(NotFoundProblem);
      expect(error).toMatchObject({
        status: 404,
        type: 'urn:pocket-comms:problem:bookmark-not-found',
      });
    }).pipe(
      Effect.scoped,
      Effect.provide(withInbound({ get: (id) => Effect.fail(new BookmarkNotFoundError({ id })) })),
    ),
  );
});
