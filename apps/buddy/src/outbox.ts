import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';

/** A recorded clip waiting to reach the brainstorm chat. */
export interface Clip {
  readonly id: string;
  readonly bytes: Uint8Array;
}

/** The outbox could not be read or written, such as a full or missing disk. */
export class OutboxError extends Data.TaggedError('OutboxError')<{ readonly reason: string }> {}

/**
 * The clips not yet in the chat, oldest first. It keeps them across restarts, so a clip is never
 * lost to a missing connection.
 */
export class Outbox extends Context.Service<
  Outbox,
  {
    readonly put: (bytes: Uint8Array) => Effect.Effect<Clip, OutboxError>;
    readonly oldest: Effect.Effect<Option.Option<Clip>, OutboxError>;
    readonly remove: (id: string) => Effect.Effect<void, OutboxError>;
    readonly size: Effect.Effect<number, OutboxError>;
  }
>()('buddy/Outbox') {}
