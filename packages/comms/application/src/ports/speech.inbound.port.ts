import type { InvalidInputError } from '@pocket-comms/comms-domain';
import type { TranscriberNotSetUp, TranscriberUnavailable } from '@smotastic/pocket-agent';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { SpeechDto } from '../dto/speech.dto.js';
import { makeSpeech } from '../use-cases/speech.use-case.js';

// The inbound port of voice messages: a clip in, its words out.

export class SpeechInbound extends Context.Service<
  SpeechInbound,
  {
    /** The server has a speech service set up, so the composers offer Record voice. */
    readonly available: Effect.Effect<boolean>;
    readonly transcribe: (
      bytes: Uint8Array,
    ) => Effect.Effect<SpeechDto, InvalidInputError | TranscriberNotSetUp | TranscriberUnavailable>;
  }
>()('comms/application/SpeechInbound') {
  static readonly layer = Layer.effect(
    SpeechInbound,
    Effect.gen(function* () {
      return { ...(yield* makeSpeech) };
    }),
  );
}
