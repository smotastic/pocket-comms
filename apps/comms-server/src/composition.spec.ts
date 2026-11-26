import { afterEach, describe, expect, it } from '@effect/vitest';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Layer from 'effect/Layer';
import { HttpRouter, HttpServer } from 'effect/http';
import * as Option from 'effect/Option';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Repositories } from '@pocket-comms/comms-infrastructure';
import { server } from './composition.js';

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
  await dispose?.();
});

// A repositories root with `app`, whose origin is on the app's Gitea. Its git never sees the
// variables a git hook sets.
const repositoriesRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'planets-'));
  mkdirSync(join(root, 'app'));
  const env = { ...Repositories.gitEnvironment(process.env) };
  execFileSync('git', ['init', '--quiet'], { cwd: join(root, 'app'), env, stdio: 'pipe' });
  execFileSync('git', ['remote', 'add', 'origin', 'gitea:owner/app.git'], {
    cwd: join(root, 'app'),
    env,
    stdio: 'pipe',
  });
  return root;
};

// The server as `main.ts` composes it, served in process, with Herdr away and no Gitea token.
const serve = (
  planets = mkdtempSync(join(tmpdir(), 'planets-')),
  stateDir = mkdtempSync(join(tmpdir(), 'state-')),
  speech?: { readonly url: string; readonly model: string },
  multiplexer: 'herdr' | 'hc' = 'herdr',
) => {
  const web = HttpRouter.toWebHandler(
    server({
      allowedLogin: 'smotastic@',
      multiplexer,
      socketPath: join(mkdtempSync(join(tmpdir(), 'no-herdr-')), 'herdr.sock'),
      hcSocketPath: join(mkdtempSync(join(tmpdir(), 'no-hc-')), 'hc.sock'),
      home: mkdtempSync(join(tmpdir(), 'home-')),
      repositoriesRoot: planets,
      worktreesRoot: mkdtempSync(join(tmpdir(), 'worktrees-')),
      agentArgs: [],
      gitea: { url: 'http://127.0.0.1:9', token: Option.none(), hosts: ['gitea'] },
      stateDir,
      ...(speech === undefined ? {} : { speech }),
    }).pipe(
      Layer.provide(HttpServer.layerServices),
      // No brainstorm settings, whatever the environment of the test holds.
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
    ),
    { disableLogger: true },
  );
  dispose = web.dispose;
  return (path: string, init: RequestInit = {}) =>
    web.handler(
      new Request(`http://localhost${path}`, {
        ...init,
        headers: { ...init.headers, 'tailscale-user-login': 'smotastic@github' },
      }),
    );
};

describe('the composed server', () => {
  it('answers 503 for the agents while Herdr is away', async () => {
    const response = await serve()('/api/v1/agents');

    expect(response.status).toBe(503);
  });

  it('answers 503 for the planets while Herdr is away', async () => {
    expect((await serve()('/api/v1/planets')).status).toBe(503);
  });

  it("shows a Gitea planet's issues as not configured without a token", async () => {
    const response = await serve(repositoriesRoot())('/api/v1/planets/app/issues');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ _tag: 'NotConfigured' });
  });

  it('answers 404 for the issues of an unknown planet', async () => {
    expect((await serve()('/api/v1/planets/nope/issues')).status).toBe(404);
  });

  it('says that the brainstorm is not set up without a model, and still serves', async () => {
    const response = await serve()('/api/v1/brainstorm');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      _tag: 'NotSetUp',
      reason: 'Set COMMS_BRAINSTORM_PROVIDER and COMMS_BRAINSTORM_MODEL.',
    });
  });

  it('serves an empty activity timeline while Herdr is away', async () => {
    const response = await serve()('/api/v1/activity');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ events: [] });
  });

  it.each(['herdr', 'hc'] as const)(
    'works with %s as its multiplexer and names it while it is away',
    async (multiplexer) => {
      const response = await serve(undefined, undefined, undefined, multiplexer)('/api/v1/events');
      const reader = response.body?.getReader();
      const first = await reader?.read();
      await reader?.cancel();

      expect(new TextDecoder().decode(first?.value)).toContain(
        `"_tag":"Unavailable","multiplexer":"${multiplexer}"`,
      );
    },
  );

  it('is not ready while Herdr is away', async () => {
    expect((await serve()('/health/ready')).status).toBe(503);
  });

  it('makes the push keys in the state folder and keeps them', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'state-'));
    const first = await serve(undefined, stateDir)('/api/v1/push/key');
    const { publicKey } = (await first.json()) as { publicKey: string };
    await dispose?.();

    const again = await serve(undefined, stateDir)('/api/v1/push/key');

    expect(first.status).toBe(200);
    expect(await again.json()).toEqual({ publicKey });
    expect(existsSync(join(stateDir, 'push', 'vapid.json'))).toBe(true);
  });

  it('is live while it runs', async () => {
    expect((await serve()('/health/live')).status).toBe(200);
  });
});

describe('voice messages in the composed server', () => {
  const voiceMessage = {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2]),
  };

  it('are not set up without the speech settings', async () => {
    const response = await serve()('/api/v1/speech/transcriptions', voiceMessage);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      type: 'urn:pocket-comms:problem:speech-not-set-up',
    });
  });

  it('go to the speech service the settings name', async () => {
    const speech = { url: 'http://127.0.0.1:9/v1', model: 'Systran/faster-whisper-small' };

    const response = await serve(
      undefined,
      undefined,
      speech,
    )('/api/v1/speech/transcriptions', voiceMessage);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      type: 'urn:pocket-comms:problem:speech-unavailable',
      detail: 'The speech service cannot be reached.',
    });
  });
});
