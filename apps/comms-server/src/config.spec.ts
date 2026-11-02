import { describe, expect, it } from '@effect/vitest';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import { homedir } from 'node:os';
import { HOST, serverConfig } from './config.js';

const withEnv =
  (env: Record<string, string>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provide(effect, ConfigProvider.layer(ConfigProvider.fromEnv({ env })));

describe('serverConfig', () => {
  it.effect('listens on port 4410 and lets smotastic@ in by default', () =>
    Effect.gen(function* () {
      const { giteaToken, brainstormApiKey, ...config } = yield* serverConfig;

      expect(Option.isNone(giteaToken)).toBe(true);
      expect(Option.isNone(brainstormApiKey)).toBe(true);
      expect(config).toEqual({
        port: 4410,
        allowedLogin: 'smotastic@',
        socketPath: `${homedir()}/.config/herdr/herdr.sock`,
        webDist: Option.none(),
        projectsRoot: `${homedir()}/Development/projects`,
        agentArgs: [],
        giteaUrl: 'http://localhost:3000',
        giteaHosts: ['gitea'],
        stateDir: `${homedir()}/.pocket-comms`,
        brainstormProvider: Option.none(),
        brainstormModel: Option.none(),
        brainstormThinking: 'off',
        piAuthFile: `${homedir()}/.pi/agent/auth.json`,
      });
    }).pipe(withEnv({})),
  );

  it.effect('reads its settings from the environment', () =>
    Effect.gen(function* () {
      const { giteaToken, brainstormApiKey, ...config } = yield* serverConfig;

      expect(Option.map(giteaToken, Redacted.value)).toEqual(Option.some('secret-token'));
      expect(Option.map(brainstormApiKey, Redacted.value)).toEqual(Option.some('model-key'));
      expect(config).toEqual({
        port: 5000,
        allowedLogin: 'someone@github',
        socketPath: '/tmp/herdr.sock',
        webDist: Option.some('/srv/web'),
        projectsRoot: '/srv/projects',
        agentArgs: ['--model', 'opus'],
        giteaUrl: 'https://git.example.com',
        giteaHosts: ['gitea', 'git.example.com'],
        stateDir: '/srv/state',
        brainstormProvider: Option.some('openai'),
        brainstormModel: Option.some('gpt-6-luna'),
        brainstormThinking: 'medium',
        piAuthFile: '/srv/pi/auth.json',
      });
    }).pipe(
      withEnv({
        COMMS_PORT: '5000',
        COMMS_ALLOWED_LOGIN: 'someone@github',
        HERDR_SOCKET_PATH: '/tmp/herdr.sock',
        COMMS_WEB_DIST: '/srv/web',
        COMMS_PROJECTS_ROOT: '/srv/projects',
        COMMS_AGENT_ARGS: ' --model   opus ',
        COMMS_GITEA_URL: 'https://git.example.com',
        COMMS_GITEA_TOKEN: 'secret-token',
        COMMS_GITEA_HOSTS: ' gitea, git.example.com ,',
        COMMS_STATE_DIR: '/srv/state',
        COMMS_BRAINSTORM_PROVIDER: 'openai',
        COMMS_BRAINSTORM_MODEL: 'gpt-6-luna',
        COMMS_BRAINSTORM_API_KEY: 'model-key',
        COMMS_BRAINSTORM_THINKING: 'medium',
        PI_CODING_AGENT_DIR: '/srv/pi',
      }),
    ),
  );

  it.effect('treats an empty Gitea token as none and never shows it', () =>
    Effect.gen(function* () {
      const empty = yield* serverConfig.pipe(withEnv({ COMMS_GITEA_TOKEN: '' }));
      const set = yield* serverConfig.pipe(withEnv({ COMMS_GITEA_TOKEN: 'secret-token' }));

      expect(Option.isNone(empty.giteaToken)).toBe(true);
      expect(String(set.giteaToken)).not.toContain('secret-token');
      expect(JSON.stringify(set)).not.toContain('secret-token');
    }),
  );

  it('listens on the loopback interface only', () => {
    expect(HOST).toBe('127.0.0.1');
  });
});
