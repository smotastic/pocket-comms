import { describe, expect, it } from '@effect/vitest';
import { AgentRuntimeOutbound } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import * as Stream from 'effect/Stream';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerPi, type PiOptions } from './pi-config.js';

/** A Pi credential file in a new directory, with a ChatGPT login when `withLogin`. */
const piFile = (withLogin: boolean) =>
  Effect.promise(async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'pi-auth-')), 'auth.json');
    if (withLogin) {
      await writeFile(
        path,
        JSON.stringify({ openai: { type: 'oauth', access: 'a', refresh: 'r', expires: 1 } }),
      );
    }
    return path;
  });

const options = (overrides: Partial<PiOptions>): PiOptions => ({
  provider: Option.some('anthropic'),
  model: Option.some('claude-haiku-4-5'),
  apiKey: Option.some(Redacted.make('test-key')),
  authFile: '/nowhere/auth.json',
  thinking: 'off',
  ...overrides,
});

const runtimeOf = (piOptions: PiOptions) =>
  AgentRuntimeOutbound.pipe(Effect.provide(layerPi(piOptions)));

describe('the Pi runtime settings', () => {
  it.effect('set up the runtime for a known provider and model', () =>
    Effect.gen(function* () {
      const runtime = yield* runtimeOf(options({}));
      expect(runtime.notSetUp).toEqual(Option.none());
    }),
  );

  it.effect('name the missing settings, and the turn fails with that reason', () =>
    Effect.gen(function* () {
      const runtime = yield* runtimeOf(options({ provider: Option.none(), model: Option.none() }));
      const reason =
        'Set COMMS_BRAINSTORM_PROVIDER and COMMS_BRAINSTORM_MODEL to use the brainstorm chat.';
      expect(runtime.notSetUp).toEqual(Option.some(reason));
      const error = yield* Stream.runCollect(
        runtime.runTurn({
          sessionId: 's',
          instructions: '',
          state: Option.none(),
          input: 'Hi',
          images: [],
          tools: [],
        }),
      ).pipe(Effect.flip);
      expect(error.reason).toBe(reason);
    }),
  );

  it.effect('name a model the provider does not have', () =>
    Effect.gen(function* () {
      const runtime = yield* runtimeOf(options({ model: Option.some('no-such-model') }));
      expect(Option.getOrUndefined(runtime.notSetUp)).toBe(
        'COMMS_BRAINSTORM_MODEL=no-such-model is no model of COMMS_BRAINSTORM_PROVIDER=anthropic.',
      );
    }),
  );

  it.effect('use the Pi login without a key, and say when there is none', () =>
    Effect.gen(function* () {
      const withLogin = yield* piFile(true);
      const withoutLogin = yield* piFile(false);
      const openai = { provider: Option.some('openai'), model: Option.some('gpt-4o') };

      const loggedIn = yield* runtimeOf(
        options({ ...openai, apiKey: Option.none(), authFile: withLogin }),
      );
      const loggedOut = yield* runtimeOf(
        options({ ...openai, apiKey: Option.some(Redacted.make('')), authFile: withoutLogin }),
      );

      expect(loggedIn.notSetUp).toEqual(Option.none());
      expect(Option.getOrUndefined(loggedOut.notSetUp)).toContain(
        'COMMS_BRAINSTORM_PROVIDER=openai has no credentials',
      );
    }),
  );
});
