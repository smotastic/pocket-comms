import { NodeRuntime } from '@effect/platform-node';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { examplesLayer, sqlServices } from './composition.js';
import { databaseLayer } from './database.js';

// The seed step of the local dev command, run after the migrations. Running it again adds only
// the examples whose URL is free, so restarts neither fail nor duplicate them.
Layer.build(examplesLayer).pipe(
  Effect.scoped,
  Effect.provide(sqlServices),
  Effect.provide(databaseLayer),
  NodeRuntime.runMain,
);
