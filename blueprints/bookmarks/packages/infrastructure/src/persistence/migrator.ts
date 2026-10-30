import * as Effect from 'effect/Effect';
import { Migrator, SqlClient } from 'effect/sql';
import createBookmarks from './migrations/0001_create_bookmarks.js';

/** Every migration of the module, by `<id>_<name>`. A static map, so the build needs no globbing. */
export const migrations = {
  '0001_create_bookmarks': createBookmarks,
};

// The migrations table lives in the module's own schema, so the history moves with the module.
const MIGRATIONS_TABLE = 'bookmarks.effect_sql_migrations';

const run = Migrator.make({});

// Any constant works; it only has to be the same for every runner of this module.
const MIGRATION_LOCK_KEY = 730_001;

/**
 * Runs the pending migrations and returns the ones it ran. The `Migrator` locks its table, so a
 * second runner waits. On an empty database that table does not exist yet, so one locked
 * transaction creates the schema and the table first; its columns are the ones the `Migrator`
 * creates itself.
 */
export const runMigrations = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
      yield* sql`CREATE SCHEMA IF NOT EXISTS bookmarks`;
      yield* sql`
        CREATE TABLE IF NOT EXISTS ${sql(MIGRATIONS_TABLE)} (
          migration_id integer PRIMARY KEY,
          created_at timestamp with time zone NOT NULL DEFAULT now(),
          name text NOT NULL
        )
      `;
    }),
  );
  return yield* run({ loader: Migrator.fromRecord(migrations), table: MIGRATIONS_TABLE });
});
