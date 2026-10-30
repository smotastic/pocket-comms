import { afterEach, describe, expect, it } from '@effect/vitest';
import {
  AgentNotFoundError,
  AgentsInbound,
  HerdrRejectedError,
  HerdrUnavailableError,
  type AgentDto,
  type OverviewDto,
} from '@pocket-comms/comms-application';
import { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import { HttpRouter, HttpServer } from 'effect/http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commsServerLayer } from './comms-api.layer.js';

const kirk: AgentDto = {
  ref: 'kirk',
  paneId: 'w1:p1',
  name: 'kirk',
  kind: 'claude',
  format: 'claude',
  status: 'blocked',
  title: 'Fix the build',
  cwd: '/work/app',
  workspace: 'app',
  changedAt: 1_000,
  needsYou: true,
};
const overview: OverviewDto = { needsYou: [kirk], groups: [] };

const webDist = () => {
  const dir = mkdtempSync(join(tmpdir(), 'comms-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>pocket-comms</title>');
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(join(dir, 'manifest.webmanifest'), '{"name":"pocket-comms"}');
  return dir;
};

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

/** The whole server on a mock of the use cases; `call` sends the allowed login unless told not to. */
const serve = (inbound: Partial<AgentsInbound['Service']>, web?: string) => {
  const app = HttpRouter.toWebHandler(
    commsServerLayer({
      allowedLogin: 'smotastic@',
      readiness: Effect.void,
      ...(web === undefined ? {} : { webDist: web }),
    }).pipe(
      Layer.provide(Layer.mock(AgentsInbound, inbound)),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  );
  dispose = app.dispose;
  return (path: string, init: RequestInit & { readonly login?: string | null } = {}) => {
    const headers = new Headers(init.headers);
    if (init.login !== null) headers.set('tailscale-user-login', init.login ?? 'smotastic@github');
    return app.handler(new Request(`http://localhost${path}`, { ...init, headers }));
  };
};

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('the Tailscale identity check', () => {
  it('rejects a request without a login with a 403 problem', async () => {
    const call = serve({ overview: Effect.succeed(overview) });

    const response = await call('/api/v1/agents', { login: null });

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({
      status: 403,
      type: 'urn:pocket-comms:problem:login-not-allowed',
    });
  });

  it('rejects another login', async () => {
    const call = serve({ overview: Effect.succeed(overview) });

    expect((await call('/api/v1/agents', { login: 'someone@github' })).status).toBe(403);
  });

  it.each(['/health/live', '/health/ready', '/docs/openapi.json', '/', '/no/such/route'])(
    'guards %s too',
    async (path) => {
      const call = serve({}, webDist());

      expect((await call(path, { login: null })).status).toBe(403);
    },
  );

  it('lets the allowed login in', async () => {
    const call = serve({ overview: Effect.succeed(overview) });

    const response = await call('/api/v1/agents');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(overview);
  });
});

describe('the agents API', () => {
  it('answers 503 while Herdr is away', async () => {
    const call = serve({
      overview: Effect.fail(new HerdrUnavailableError({ reason: 'connect ENOENT' })),
    });

    const response = await call('/api/v1/agents');

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      type: 'urn:pocket-comms:problem:herdr-unavailable',
      detail: 'connect ENOENT',
    });
  });

  it('answers 404 for an unknown agent', async () => {
    const call = serve({ agent: (ref) => Effect.fail(new AgentNotFoundError({ ref })) });

    const response = await call('/api/v1/agents/nobody');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      type: 'urn:pocket-comms:problem:agent-not-found',
    });
  });

  it('addresses an agent by its pane id', async () => {
    const asked: Array<string> = [];
    const call = serve({
      agent: (ref) => {
        asked.push(ref);
        return Effect.succeed(kirk);
      },
    });

    expect((await call('/api/v1/agents/w1:p1')).status).toBe(200);
    expect(asked).toEqual(['w1:p1']);
  });

  it('returns the screen', async () => {
    const call = serve({ screen: () => Effect.succeed('\u001b[1mAllow?\u001b[0m') });

    expect(await (await call('/api/v1/agents/kirk/screen')).json()).toEqual({
      text: '\u001b[1mAllow?\u001b[0m',
    });
  });

  it('sends a prompt and answers 204', async () => {
    const sent: Array<[string, string]> = [];
    const call = serve({
      prompt: (ref, text) => Effect.sync(() => void sent.push([ref, text])),
    });

    const response = await call('/api/v1/agents/kirk/prompt', json({ text: 'Run the tests' }));

    expect(response.status).toBe(204);
    expect(sent).toEqual([['kirk', 'Run the tests']]);
  });

  it('answers 422 for a blank prompt', async () => {
    const call = serve({
      prompt: () =>
        Effect.fail(
          new InvalidInputError({ issues: [{ field: 'text', message: 'Write a message first.' }] }),
        ),
    });

    const response = await call('/api/v1/agents/kirk/prompt', json({ text: ' ' }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      errors: [{ field: 'text', message: 'Write a message first.' }],
    });
  });

  it('answers 422 for a key the app does not offer', async () => {
    const call = serve({ sendKeys: () => Effect.void });

    const response = await call('/api/v1/agents/kirk/keys', json({ keys: ['ctrl+d'] }));

    expect(response.status).toBe(422);
  });

  it('answers 409 when Herdr refuses the keys', async () => {
    const call = serve({
      sendKeys: (ref) =>
        Effect.fail(new HerdrRejectedError({ ref, code: 'agent_not_ready', message: 'Not ready' })),
    });

    const response = await call('/api/v1/agents/kirk/keys', json({ keys: ['1'] }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      type: 'urn:pocket-comms:problem:agent-refused-input',
    });
  });

  it('marks an agent as seen', async () => {
    const seen: Array<string> = [];
    const call = serve({ markSeen: (ref) => Effect.sync(() => void seen.push(ref)) });

    expect((await call('/api/v1/agents/kirk/seen', { method: 'POST' })).status).toBe(204);
    expect(seen).toEqual(['kirk']);
  });

  it('streams the overview as server-sent events', async () => {
    const call = serve({
      overviewChanges: Stream.make({ _tag: 'Available', overview } as const),
    });

    const response = await call('/api/v1/events');

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const text = await response.text();
    expect(text).toContain('data: ');
    expect(JSON.parse(text.slice(text.indexOf('data: ') + 6).split('\n')[0] ?? '')).toEqual({
      _tag: 'Available',
      overview,
    });
  });
});

describe('the web app', () => {
  it('serves its files and the manifest', async () => {
    const call = serve({}, webDist());

    const script = await call('/assets/app.js');
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toContain('javascript');
    const manifest = await call('/manifest.webmanifest');
    expect(manifest.headers.get('content-type')).toContain('application/manifest+json');
  });

  it.each(['/', '/agents/kirk'])('answers %s with the app page', async (path) => {
    const call = serve({}, webDist());

    const response = await call(path);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>pocket-comms</title>');
  });

  it.each(['/..%2Fsecret.txt', '/assets/..%2F..%2Fsecret.txt', '/../secret.txt'])(
    'never serves a file outside its folder, such as %s',
    async (path) => {
      const parent = mkdtempSync(join(tmpdir(), 'comms-parent-'));
      writeFileSync(join(parent, 'secret.txt'), 'the secret');
      const dist = join(parent, 'dist');
      mkdirSync(dist);
      writeFileSync(join(dist, 'index.html'), '<title>pocket-comms</title>');
      const call = serve({}, dist);

      const body = await (await call(path)).text();

      expect(body).not.toContain('the secret');
      expect(body).toContain('<title>pocket-comms</title>');
    },
  );

  it('serves its files when the folder is given with a trailing slash', async () => {
    const call = serve({}, `${webDist()}/`);

    const script = await call('/assets/app.js');

    expect(await script.text()).toBe('console.log(1)');
  });
});
