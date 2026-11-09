import { describe, expect, it } from '@effect/vitest';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buddyConfig } from './config.js';

const read = (env: Record<string, string>) =>
  buddyConfig.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))));

describe('buddyConfig', () => {
  it.effect('reads the comms address and fills in the defaults', () =>
    Effect.gen(function* () {
      const config = yield* read({ BUDDY_COMMS_URL: 'https://comms.example.ts.net/' });

      expect(config).toEqual({
        commsUrl: 'https://comms.example.ts.net',
        home: join(homedir(), '.pocket-buddy'),
        audioDevice: '0',
      });
    }),
  );

  it.effect('takes the home folder and the audio device from the environment', () =>
    Effect.gen(function* () {
      const config = yield* read({
        BUDDY_COMMS_URL: 'https://comms.example.ts.net',
        BUDDY_HOME: '/tmp/buddy',
        BUDDY_AUDIO_DEVICE: '2',
      });

      expect(config.home).toBe('/tmp/buddy');
      expect(config.audioDevice).toBe('2');
    }),
  );

  it.effect('refuses to start without the comms address', () =>
    Effect.gen(function* () {
      const error = yield* read({}).pipe(Effect.flip);

      expect(String(error)).toContain('BUDDY_COMMS_URL');
    }),
  );

  it.effect('refuses an address that is not http', () =>
    Effect.gen(function* () {
      const error = yield* read({ BUDDY_COMMS_URL: 'comms.example.ts.net' }).pipe(Effect.flip);

      expect(String(error)).toContain('BUDDY_COMMS_URL');
    }),
  );
});
