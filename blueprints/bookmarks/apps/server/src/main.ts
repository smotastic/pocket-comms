import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import * as Config from 'effect/Config';
import * as Layer from 'effect/Layer';
import { createServer } from 'node:http';
import { server, sqlReadiness, sqlServices } from './composition.js';
import { databaseLayer } from './database.js';

// Serves the API. Migrations are a separate step (`migrate.ts`), run before this one.
const main = server(sqlReadiness).pipe(
  Layer.provide(sqlServices),
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      port: Config.Port('PORT').pipe(Config.withDefault(3000)),
    }),
  ),
  Layer.provide(databaseLayer),
);

Layer.launch(main).pipe(NodeRuntime.runMain);
