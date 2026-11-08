import type { ClipFormat } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type { SpeechNotSetUpError, SpeechUnavailableError } from '../errors.js';

/** A voice message as the speech service gets it. */
export interface Clip {
  readonly bytes: Uint8Array;
  readonly format: ClipFormat;
}

/**
 * The speech-to-text service of voice messages. Only the server calls it; the clip stays in
 * memory and nothing of it is kept.
 */
export class SpeechOutbound extends Context.Service<
  SpeechOutbound,
  {
    /** The server has a speech service set up. */
    readonly available: boolean;
    /** The words of the clip, in the language the service detects. */
    readonly transcribe: (
      clip: Clip,
    ) => Effect.Effect<string, SpeechNotSetUpError | SpeechUnavailableError>;
  }
>()('comms/application/SpeechOutbound') {}
