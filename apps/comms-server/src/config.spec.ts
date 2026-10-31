import { describe, expect, it } from '@effect/vitest';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { homedir } from 'node:os';
import { HOST, serverConfig } from './config.js';

const withEnv =
  (env: Record<string, string>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provide(effect, ConfigProvider.layer(ConfigProvider.fromEnv({ env })));

describe('serverConfig', () => {
  it.effect('listens on port 4410 and lets smotastic@ in by default', () =>
    Effect.gen(function* () {
      const config = yield* serverConfig;

      expect(config).toEqual({
        port: 4410,
        allowedLogin: 'smotastic@',
        socketPath: `${homedir()}/.config/herdr/herdr.sock`,
        webDist: Option.none(),
      });
    }).pipe(withEnv({})),
  );

  it.effect('reads its settings from the environment', () =>
    Effect.gen(function* () {
      const config = yield* serverConfig;

      expect(config).toEqual({
        port: 5000,
        allowedLogin: 'someone@github',
        socketPath: '/tmp/herdr.sock',
        webDist: Option.some('/srv/web'),
      });
    }).pipe(
      withEnv({
        COMMS_PORT: '5000',
        COMMS_ALLOWED_LOGIN: 'someone@github',
        HERDR_SOCKET_PATH: '/tmp/herdr.sock',
        COMMS_WEB_DIST: '/srv/web',
      }),
    ),
  );

  it('listens on the loopback interface only', () => {
    expect(HOST).toBe('127.0.0.1');
  });
});
