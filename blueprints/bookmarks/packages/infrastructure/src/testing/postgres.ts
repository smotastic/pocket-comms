import { PgClient } from '@effect/sql-pg';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';

/** A PostgreSQL 17 container for one test file, stopped when the layer is released. */
export const postgresContainer = Effect.acquireRelease(
  Effect.promise(() => new PostgreSqlContainer('postgres:17-alpine').start()),
  (container) => Effect.promise(() => container.stop()),
);

export const postgresLayer = Layer.unwrap(
  Effect.map(postgresContainer, (container) =>
    PgClient.layer({ url: Redacted.make(container.getConnectionUri()) }),
  ),
);
