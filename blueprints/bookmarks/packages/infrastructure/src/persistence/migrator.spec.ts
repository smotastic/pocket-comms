import { describe, expect, layer } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import { SqlClient } from 'effect/sql';
import { postgresLayer } from '../testing/postgres.js';
import { runMigrations } from './index.js';

layer(postgresLayer, { timeout: 120_000 })('runMigrations', (it) => {
  describe('with two runners at once', () => {
    it.effect('runs each migration once and both runners succeed', () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`DROP SCHEMA IF EXISTS bookmarks CASCADE`;
        const [a, b] = yield* Effect.all([runMigrations, runMigrations], { concurrency: 2 });
        expect([...a, ...b]).toEqual([[1, 'create_bookmarks']]);
        yield* sql`DROP SCHEMA bookmarks CASCADE`;
      }),
    );
  });

  describe('on an empty database', () => {
    it.effect('creates the bookmarks table, and a second run changes nothing', () =>
      Effect.gen(function* () {
        const first = yield* runMigrations;
        expect(first).toEqual([[1, 'create_bookmarks']]);
        const second = yield* runMigrations;
        expect(second).toEqual([]);
        const sql = yield* SqlClient.SqlClient;
        const tables = yield* sql<{ table_name: string }>`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'bookmarks' ORDER BY table_name
        `;
        expect(tables.map((row) => row.table_name)).toEqual(['bookmarks', 'effect_sql_migrations']);
      }),
    );
  });
});
