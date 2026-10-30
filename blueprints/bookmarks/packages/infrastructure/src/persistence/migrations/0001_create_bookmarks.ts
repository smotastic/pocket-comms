import * as Effect from 'effect/Effect';
import { SqlClient } from 'effect/sql';

// Forward-only and additive (ADR 0004). A migration imports no domain or application code, so it
// stays unchanged while the code evolves. The constraints protect data integrity only.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE SCHEMA IF NOT EXISTS bookmarks`;
  yield* sql`
    CREATE TABLE bookmarks.bookmarks (
      id uuid PRIMARY KEY,
      url text NOT NULL,
      title text NOT NULL,
      tags text[] NOT NULL,
      status text NOT NULL,
      version integer NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT bookmarks_url_key UNIQUE (url)
    )
  `;
  yield* sql`
    CREATE INDEX bookmarks_created_at_id_idx
      ON bookmarks.bookmarks (created_at DESC, id DESC)
  `;
  yield* sql`CREATE INDEX bookmarks_tags_idx ON bookmarks.bookmarks USING gin (tags)`;
});
