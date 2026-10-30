import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest';
import * as Layer from 'effect/Layer';
import { HttpRouter, HttpServer } from 'effect/http';
import { inMemoryServer } from './composition.js';

// The server of `main.memory.ts`, served in process: no PostgreSQL, seeded with the examples.
describe('the server in memory', () => {
  let server: { handler: (request: Request) => Promise<Response>; dispose: () => Promise<void> };

  beforeAll(() => {
    const web = HttpRouter.toWebHandler(
      inMemoryServer.pipe(Layer.provide(HttpServer.layerServices)),
      { disableLogger: true },
    );
    server = { handler: (request) => web.handler(request), dispose: web.dispose };
  });

  afterAll(async () => {
    await server?.dispose();
  });

  const request = (path: string) => server.handler(new Request(`http://localhost${path}`));

  it('serves the examples through the API', async () => {
    const response = await request('/api/v1/bookmarks?status=all');
    expect(response.status).toBe(200);
    const { items } = (await response.json()) as { items: ReadonlyArray<{ status: string }> };
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.filter(({ status }) => status === 'archived')).toHaveLength(1);
  });

  it('is ready without a database', async () => {
    expect((await request('/health/ready')).status).toBe(200);
  });
});
