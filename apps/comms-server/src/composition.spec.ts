import { afterEach, describe, expect, it } from '@effect/vitest';
import * as Layer from 'effect/Layer';
import { HttpRouter, HttpServer } from 'effect/http';
import * as Option from 'effect/Option';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Projects } from '@pocket-comms/comms-infrastructure';
import { server } from './composition.js';

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
  await dispose?.();
});

// A projects root with `app`, whose origin is on the app's Gitea. Its git never sees the
// variables a git hook sets.
const projectsRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'projects-'));
  mkdirSync(join(root, 'app'));
  const env = { ...Projects.gitEnvironment(process.env) };
  execFileSync('git', ['init', '--quiet'], { cwd: join(root, 'app'), env, stdio: 'pipe' });
  execFileSync('git', ['remote', 'add', 'origin', 'gitea:owner/app.git'], {
    cwd: join(root, 'app'),
    env,
    stdio: 'pipe',
  });
  return root;
};

// The server as `main.ts` composes it, served in process, with Herdr away and no Gitea token.
const serve = (projects = mkdtempSync(join(tmpdir(), 'projects-'))) => {
  const web = HttpRouter.toWebHandler(
    server({
      allowedLogin: 'smotastic@',
      socketPath: join(mkdtempSync(join(tmpdir(), 'no-herdr-')), 'herdr.sock'),
      home: mkdtempSync(join(tmpdir(), 'home-')),
      projectsRoot: projects,
      agentArgs: [],
      gitea: { url: 'http://127.0.0.1:9', token: Option.none(), hosts: ['gitea'] },
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

  it("shows a Gitea project's issues as not configured without a token", async () => {
    const response = await serve(projectsRoot())('/api/v1/projects/app/issues');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ _tag: 'NotConfigured' });
  });

  it('answers 404 for the issues of an unknown project', async () => {
    expect((await serve()('/api/v1/projects/nope/issues')).status).toBe(404);
  });

  it('is not ready while Herdr is away', async () => {
    expect((await serve()('/health/ready')).status).toBe(503);
  });

  it('is live while it runs', async () => {
    expect((await serve()('/health/live')).status).toBe(200);
  });
});
