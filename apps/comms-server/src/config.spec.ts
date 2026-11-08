import { describe, expect, it } from '@effect/vitest';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import { homedir } from 'node:os';
import { HOST, serverConfig, speechSettings } from './config.js';

const withEnv =
  (env: Record<string, string>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provide(effect, ConfigProvider.layer(ConfigProvider.fromEnv({ env })));

describe('serverConfig', () => {
  it.effect('listens on port 4410 and lets smotastic@ in by default', () =>
    Effect.gen(function* () {
      const { giteaToken, ...config } = yield* serverConfig;

      expect(Option.isNone(giteaToken)).toBe(true);
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
        brainstormModel: Option.none(),
        speechUrl: Option.none(),
        speechModel: Option.none(),
      });
    }).pipe(withEnv({})),
  );

  it.effect('reads its settings from the environment', () =>
    Effect.gen(function* () {
      const { giteaToken, ...config } = yield* serverConfig;

      expect(Option.map(giteaToken, Redacted.value)).toEqual(Option.some('secret-token'));
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
        brainstormModel: Option.some('gpt-6-luna'),
        speechUrl: Option.some('http://localhost:4430/v1'),
        speechModel: Option.some('Systran/faster-whisper-small'),
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
        COMMS_BRAINSTORM_MODEL: 'gpt-6-luna',
        COMMS_SPEECH_URL: 'http://localhost:4430/v1',
        COMMS_SPEECH_MODEL: 'Systran/faster-whisper-small',
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

describe('speechSettings', () => {
  const URL = Option.some('http://localhost:4430/v1');
  const MODEL = Option.some('Systran/faster-whisper-small');

  it('sets voice messages up with both settings', () => {
    expect(speechSettings(URL, MODEL)).toEqual({
      _tag: 'On',
      url: 'http://localhost:4430/v1',
      model: 'Systran/faster-whisper-small',
    });
  });

  it('leaves them off without either setting', () => {
    expect(speechSettings(Option.none(), Option.none())).toEqual({ _tag: 'Off' });
  });

  it('leaves them off with only one setting, and says so', () => {
    expect(speechSettings(URL, Option.none())).toEqual({ _tag: 'HalfSet' });
    expect(speechSettings(Option.none(), MODEL)).toEqual({ _tag: 'HalfSet' });
  });

  it('leaves them off with a URL that is not http, and says so', () => {
    expect(speechSettings(Option.some('localhost:4430/v1'), MODEL)).toEqual({ _tag: 'BadUrl' });
    expect(speechSettings(Option.some('not a url'), MODEL)).toEqual({ _tag: 'BadUrl' });
    expect(speechSettings(Option.some('ftp://localhost/v1'), MODEL)).toEqual({ _tag: 'BadUrl' });
  });
});
