import { PgClient } from '@effect/sql-pg';
import { recordingTracer } from '@pocket-comms/backend-shared/observability/testing';
import { bookmarksServerLayer } from '@pocket-comms/bookmarks-api';
import { runMigrations } from '@pocket-comms/bookmarks-infrastructure';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import { HttpRouter, HttpServer } from 'effect/http';
import { sqlReadiness, sqlServices } from './composition.js';

// The server on a real PostgreSQL, as `main.ts` composes it, served in process.
describe('the server on PostgreSQL', () => {
  let container: StartedPostgreSqlContainer;
  let server: { handler: (request: Request) => Promise<Response>; dispose: () => Promise<void> };
  const tracer = recordingTracer();

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    const database = PgClient.layer({ url: Redacted.make(container.getConnectionUri()) });
    await Effect.runPromise(Effect.provide(runMigrations, database));
    const web = HttpRouter.toWebHandler(
      bookmarksServerLayer(sqlReadiness).pipe(
        Layer.provide(sqlServices),
        Layer.provide(database),
        Layer.provide(HttpServer.layerServices),
        Layer.provideMerge(tracer.layer),
      ),
      { disableLogger: true },
    );
    server = { handler: (request) => web.handler(request), dispose: web.dispose };
  }, 120_000);

  afterAll(async () => {
    await server?.dispose();
    await container?.stop();
  });

  const request = (path: string, init: RequestInit = {}) =>
    server.handler(new Request(`http://localhost${path}`, init));

  it('stores and reads a bookmark', async () => {
    const created = await request('/api/v1/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://effect.website', title: 'Effect', tags: [] }),
    });
    expect(created.status).toBe(201);
    const location = created.headers.get('location') ?? '';
    const found = await request(location);
    expect(found.status).toBe(200);
    expect(found.headers.get('etag')).toBe('"1"');
  });

  it('traces the SQL statements of a repository insert', async () => {
    await request('/api/v1/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://effect.website/sql', title: 'SQL', tags: [] }),
    });
    const inserts = tracer.spans.filter((span) => span.name === 'BookmarkRepository.insert');
    const statements = tracer.spans.filter((span) => span.name === 'sql.execute');
    expect(
      statements.some(
        (statement) =>
          Option.getOrUndefined(statement.parent)?.spanId === inserts.at(-1)?.spanId &&
          statement.attributes.get('db.system.name') === 'postgresql',
      ),
    ).toBe(true);
  });

  it('serves the OpenAPI document and the browser UI at /docs', async () => {
    expect((await request('/docs')).status).toBe(200);
    expect(await (await request('/docs/openapi.json')).json()).toMatchObject({ openapi: '3.1.0' });
  });

  it('is ready while PostgreSQL answers, and only live after it stops', async () => {
    expect((await request('/health/ready')).status).toBe(200);
    await container.stop();
    expect((await request('/health/ready')).status).toBe(503);
    expect((await request('/health/live')).status).toBe(200);
  }, 30_000);
});
