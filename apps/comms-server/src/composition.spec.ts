import { afterEach, describe, expect, it } from '@effect/vitest';
import * as Layer from 'effect/Layer';
import { HttpRouter, HttpServer } from 'effect/http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { server } from './composition.js';

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
  await dispose?.();
});

// The server as `main.ts` composes it, served in process, with Herdr away.
const serve = () => {
  const web = HttpRouter.toWebHandler(
    server({
      allowedLogin: 'smotastic@',
      socketPath: join(mkdtempSync(join(tmpdir(), 'no-herdr-')), 'herdr.sock'),
      home: mkdtempSync(join(tmpdir(), 'home-')),
      projectsRoot: mkdtempSync(join(tmpdir(), 'projects-')),
      agentArgs: [],
    }).pipe(Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  );
  dispose = web.dispose;
  return (path: string) =>
    web.handler(
      new Request(`http://localhost${path}`, {
        headers: { 'tailscale-user-login': 'smotastic@github' },
      }),
    );
};

describe('the composed server', () => {
  it('answers 503 for the agents while Herdr is away', async () => {
    const response = await serve()('/api/v1/agents');

    expect(response.status).toBe(503);
  });

  it('answers 503 for the projects while Herdr is away', async () => {
    expect((await serve()('/api/v1/projects')).status).toBe(503);
  });

  it('is not ready while Herdr is away', async () => {
    expect((await serve()('/health/ready')).status).toBe(503);
  });

  it('is live while it runs', async () => {
    expect((await serve()('/health/live')).status).toBe(200);
  });
});
