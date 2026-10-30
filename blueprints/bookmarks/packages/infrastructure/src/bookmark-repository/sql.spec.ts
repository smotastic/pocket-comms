import { expect, layer } from '@effect/vitest';
import { BookmarkRepositoryOutbound } from '@pocket-comms/bookmarks-application';
import * as Cause from 'effect/Cause';
import * as Exit from 'effect/Exit';
import { runMigrations } from '../persistence/index.js';
import { postgresLayer } from '../testing/postgres.js';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { SqlClient } from 'effect/sql';
import { BookmarkRepository } from '../index.js';
import { bookmarkFixture, repositoryContract } from '../testing/repository-contract.js';

const migrated = Layer.effectDiscard(runMigrations).pipe(Layer.provideMerge(postgresLayer));

// Every test starts from an empty table in the one container of this file.
const emptyTable = Layer.unwrap(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`TRUNCATE bookmarks.bookmarks`;
    return BookmarkRepository.layerSql;
  }),
);

layer(migrated, { timeout: 120_000 })('PostgreSQL', (it) => {
  repositoryContract('BookmarkRepository.layerSql', emptyTable, it);

  it.effect('reports a duplicate id as a defect, not as a used URL', () =>
    Effect.gen(function* () {
      const repository = yield* BookmarkRepositoryOutbound;
      const bookmark = bookmarkFixture(1);
      yield* repository.insert(bookmark);
      const exit = yield* repository
        .insert({ ...bookmark, url: bookmarkFixture(2).url })
        .pipe(Effect.exit);
      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
    }).pipe(Effect.provide(emptyTable)),
  );
});
