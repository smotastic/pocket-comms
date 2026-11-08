import { parseClip } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import type { SpeechDto } from '../dto/speech.dto.js';
import { SpeechNotSetUpError } from '../errors.js';
import { SpeechOutbound } from '../ports/speech.outbound.port.js';

// Voice messages: a clip is checked by its content and its words come back; the server keeps none
// of it.

export const makeSpeech = Effect.gen(function* () {
  const speechOutbound = yield* SpeechOutbound;

  const transcribe = Effect.fn('Speech.transcribe')(function* (bytes: Uint8Array) {
    const format = yield* Effect.fromResult(parseClip(bytes));
    if (!speechOutbound.available) return yield* new SpeechNotSetUpError();
    const text = yield* speechOutbound.transcribe({ bytes, format });
    return { text: text.trim() } satisfies SpeechDto;
  });

  return { transcribe };
});
