import { InvalidInputError } from '@pocket-comms/comms-domain';
import { makeTranscription } from '@smotastic/pocket-agent';
import * as Effect from 'effect/Effect';
import type { SpeechDto } from '../dto/speech.dto.js';

// Voice messages on the agent package's transcription: a clip is checked by its content and its
// words come back; the server keeps none of it.

export const makeSpeech = Effect.gen(function* () {
  const transcription = yield* makeTranscription;

  const transcribe = (bytes: Uint8Array) =>
    transcription.transcribe(bytes).pipe(
      Effect.map((text): SpeechDto => ({ text })),
      Effect.catchTag('ClipRefused', ({ reason }) =>
        Effect.fail(new InvalidInputError({ issues: [{ field: 'file', message: reason }] })),
      ),
    );

  return { available: transcription.available, transcribe };
});
