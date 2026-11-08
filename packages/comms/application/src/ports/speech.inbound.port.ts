import type { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { SpeechDto } from '../dto/speech.dto.js';
import type { SpeechNotSetUpError, SpeechUnavailableError } from '../errors.js';
import { makeSpeech } from '../use-cases/speech.use-case.js';

// The inbound port of voice messages: a clip in, its words out.

export class SpeechInbound extends Context.Service<
  SpeechInbound,
  {
    readonly transcribe: (
      bytes: Uint8Array,
    ) => Effect.Effect<SpeechDto, InvalidInputError | SpeechNotSetUpError | SpeechUnavailableError>;
  }
>()('comms/application/SpeechInbound') {
  static readonly layer = Layer.effect(
    SpeechInbound,
    Effect.gen(function* () {
      return { ...(yield* makeSpeech) };
    }),
  );
}
