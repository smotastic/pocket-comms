import { describe, expect, it } from '@effect/vitest';
import { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { SpeechNotSetUpError, SpeechUnavailableError } from '../errors.js';
import { SpeechInbound } from '../ports/speech.inbound.port.js';
import { fakeLayer, FakeState } from '../testing/fakes.js';

const layer = () => SpeechInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const WEBM = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);

const transcribe = (bytes: Uint8Array) => SpeechInbound.use((inbound) => inbound.transcribe(bytes));

describe('SpeechInbound.transcribe', () => {
  it.effect('passes the clip with its format on and answers the text, trimmed', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.speech.text = '  Idea: dark mode for pocket-home \n';

      const result = yield* transcribe(WEBM);

      expect(result).toEqual({ text: 'Idea: dark mode for pocket-home' });
      expect(state.speech.clips).toEqual([{ bytes: WEBM, format: 'webm' }]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('answers an empty text when the service heard no words', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.speech.text = ' ';

      expect(yield* transcribe(WEBM)).toEqual({ text: '' });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('never passes on what is not audio', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const error = yield* transcribe(new TextEncoder().encode('hello there')).pipe(Effect.flip);

      expect(error).toBeInstanceOf(InvalidInputError);
      expect(state.speech.clips).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('fails when the server has no speech service', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.speech.available = false;

      const error = yield* transcribe(WEBM).pipe(Effect.flip);

      expect(error).toBeInstanceOf(SpeechNotSetUpError);
      expect(state.speech.clips).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reports why the service failed', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.speech.failure = 'The speech service did not answer in time.';

      const error = yield* transcribe(WEBM).pipe(Effect.flip);

      expect(error).toEqual(
        new SpeechUnavailableError({ reason: 'The speech service did not answer in time.' }),
      );
    }).pipe(Effect.provide(layer())),
  );
});

describe('SpeechInbound.available', () => {
  it.effect('says whether the server has a speech service', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const inbound = yield* SpeechInbound;

      expect(yield* inbound.available).toBe(true);
      state.speech.available = false;
      expect(yield* inbound.available).toBe(false);
    }).pipe(Effect.provide(layer())),
  );
});
