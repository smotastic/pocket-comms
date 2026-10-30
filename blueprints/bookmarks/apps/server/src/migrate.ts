import { NodeRuntime } from '@effect/platform-node';
import { runMigrations } from '@pocket-comms/bookmarks-infrastructure';
import * as Effect from 'effect/Effect';
import { databaseLayer } from './database.js';

// The migration step of the server. Running it twice changes nothing the second time.
const program = Effect.gen(function* () {
  const applied = yield* runMigrations;
  yield* Effect.logInfo('Migrations applied').pipe(
    Effect.annotateLogs({ migrations: applied.map(([id, name]) => `${id}_${name}`) }),
  );
});

program.pipe(Effect.provide(databaseLayer), NodeRuntime.runMain);
