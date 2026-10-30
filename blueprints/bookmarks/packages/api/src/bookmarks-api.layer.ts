import { validationMiddlewareLayer } from '@pocket-comms/backend-shared/http';
import { BookmarksInbound } from '@pocket-comms/bookmarks-application';
import { BookmarksApi } from '@pocket-comms/bookmarks-contract';
import * as Layer from 'effect/Layer';
import type * as Effect from 'effect/Effect';
import { HttpApiBuilder, HttpApiScalar } from 'effect/http-api';
import { healthLayer } from './health.handlers.js';
import { bookmarksHandlers } from './bookmarks.handlers.js';

/** The handlers with the use cases and the middleware they need. */
export const bookmarksHandlersLayer = bookmarksHandlers.pipe(
  Layer.provide(BookmarksInbound.layer),
  Layer.provideMerge(validationMiddlewareLayer),
);

/** The API routes. The composition root provides the outbound adapters. */
export const bookmarksApiLayer = HttpApiBuilder.layer(BookmarksApi, {
  openapiPath: '/docs/openapi.json',
}).pipe(Layer.provide(bookmarksHandlersLayer));

/**
 * Every route of the server: the API, its document and browser UI at `/docs`, and the health
 * routes with the server's readiness check.
 */
export const bookmarksServerLayer = <E, R>(readiness: Effect.Effect<void, E, R>) =>
  Layer.mergeAll(
    bookmarksApiLayer,
    HttpApiScalar.layer(BookmarksApi, { path: '/docs' }),
    healthLayer(readiness),
  );
