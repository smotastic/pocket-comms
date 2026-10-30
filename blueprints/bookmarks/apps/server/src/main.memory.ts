import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { createServer } from 'node:http';
import { inMemoryServer, serve } from './composition.js';

// Serves the API without PostgreSQL, for the fastest local start (`pnpm dev:memory`). It seeds the
// example bookmarks on every start, because the store lives only as long as the process.
const server = serve(inMemoryServer).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      port: Config.Port('PORT').pipe(Config.withDefault(3000)),
    }),
  ),
);

Effect.logWarning('Running on in-memory storage; the data is lost when the server stops').pipe(
  Effect.andThen(Layer.launch(server)),
  NodeRuntime.runMain,
);
