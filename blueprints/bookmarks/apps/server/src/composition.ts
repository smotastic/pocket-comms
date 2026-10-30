import { Observability } from '@pocket-comms/backend-shared/observability';
import { bookmarksServerLayer } from '@pocket-comms/bookmarks-api';
import { BookmarksInbound } from '@pocket-comms/bookmarks-application';
import { BookmarkRepository, IdGenerator } from '@pocket-comms/bookmarks-infrastructure';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { SqlClient } from 'effect/sql';
import { seedBookmarks } from './examples.js';

// The composition root of the server: it wires the adapters. It holds no business logic.

/** The adapters on PostgreSQL; the caller provides the `SqlClient`. */
export const sqlServices = Layer.mergeAll(BookmarkRepository.layerSql, IdGenerator.layerUuidV7);

/** Ready while the database answers. */
export const sqlReadiness = SqlClient.SqlClient.use((sql) => sql`SELECT 1`);

/** The in-memory adapters, for tests and local runs without PostgreSQL. */
export const inMemoryServices = Layer.mergeAll(
  BookmarkRepository.layerInMemory,
  IdGenerator.layerUuidV7,
);

/**
 * Serves routes with traces, metrics and logs over OTLP, each where its
 * `OTEL_EXPORTER_OTLP_*ENDPOINT` points (ADR 0010).
 */
export const serve = <A, E, R>(routes: Layer.Layer<A, E, R>) =>
  Observability.serve(routes, { serviceName: 'bookmarks-server' });

/** The served API. */
export const server = <E, R>(readiness: Effect.Effect<void, E, R>) =>
  serve(bookmarksServerLayer(readiness));

/** Adds the example bookmarks once the layer is built; the caller provides the adapters. */
export const examplesLayer = Layer.effectDiscard(
  seedBookmarks.pipe(
    Effect.flatMap((added) =>
      Effect.logInfo('Example bookmarks seeded').pipe(Effect.annotateLogs({ added })),
    ),
  ),
).pipe(Layer.provide(BookmarksInbound.layer));

/**
 * Every route on the in-memory adapters, seeded with the examples. One `inMemoryServices` feeds
 * both the seed and the handlers, so they share the store; the data is gone when the process ends.
 */
export const inMemoryServer = bookmarksServerLayer(Effect.void).pipe(
  Layer.provide(examplesLayer),
  Layer.provide(inMemoryServices),
);
