import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import type * as Effect from 'effect/Effect';

/** The microphone could not record, such as without permission or without `ffmpeg`. */
export class RecorderError extends Data.TaggedError('RecorderError')<{
  readonly reason: string;
}> {}

/** A voice message in progress; `stop` ends it and answers the voice message as WAV bytes. */
export interface Capture {
  readonly stop: Effect.Effect<Uint8Array, RecorderError>;
}

/** The buddy's microphone. */
export class Recorder extends Context.Service<
  Recorder,
  { readonly start: Effect.Effect<Capture, RecorderError> }
>()('buddy/Recorder') {}
