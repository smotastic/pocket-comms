import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import type * as Effect from 'effect/Effect';

/** The microphone could not record, such as without permission or without `ffmpeg`. */
export class RecorderError extends Data.TaggedError('RecorderError')<{
  readonly reason: string;
}> {}

/** A recording in progress; `stop` ends it and answers the clip as WAV bytes. */
export interface Recording {
  readonly stop: Effect.Effect<Uint8Array, RecorderError>;
}

/** The buddy's microphone. */
export class Recorder extends Context.Service<
  Recorder,
  { readonly start: Effect.Effect<Recording, RecorderError> }
>()('buddy/Recorder') {}
