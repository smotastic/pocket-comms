import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';

/** A recorded voice message waiting to reach the brainstorm. */
export interface VoiceMessage {
  readonly id: string;
  readonly bytes: Uint8Array;
}

/** The outbox could not be read or written, such as a full or missing disk. */
export class OutboxError extends Data.TaggedError('OutboxError')<{ readonly reason: string }> {}

/**
 * The voice messages not yet in the brainstorm, oldest first. It keeps them across restarts, so a voice message is never
 * lost to a missing connection.
 */
export class Outbox extends Context.Service<
  Outbox,
  {
    readonly put: (bytes: Uint8Array) => Effect.Effect<VoiceMessage, OutboxError>;
    readonly oldest: Effect.Effect<Option.Option<VoiceMessage>, OutboxError>;
    readonly remove: (id: string) => Effect.Effect<void, OutboxError>;
    readonly size: Effect.Effect<number, OutboxError>;
  }
>()('buddy/Outbox') {}
