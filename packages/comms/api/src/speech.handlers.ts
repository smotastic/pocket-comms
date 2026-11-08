import { SpeechInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

/** Implements the `speech` group; the wire shape equals the application DTO. */
export const speechHandlers = HttpApiBuilder.group(
  CommsApi,
  'speech',
  Effect.fn(function* (handlers) {
    const speechInbound = yield* SpeechInbound;

    // The body is the clip itself; the use case checks what is in it.
    return handlers.handle('transcribe', ({ payload }) =>
      speechInbound.transcribe(payload).pipe(
        Effect.catchTags({
          InvalidInputError: problems.invalidInput,
          SpeechNotSetUpError: problems.speechNotSetUp,
          SpeechUnavailableError: problems.speechUnavailable,
        }),
      ),
    );
  }),
);
