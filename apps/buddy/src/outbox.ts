import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';

/** A recorded clip waiting to reach the brainstorm chat. */
export interface Clip {
  readonly id: string;
  readonly bytes: Uint8Array;
}

/**
 * The clips not yet in the chat, oldest first. It keeps them across restarts, so a clip is never
 * lost to a missing connection; a failure to read or write it is a defect.
 */
export class Outbox extends Context.Service<
  Outbox,
  {
    readonly put: (bytes: Uint8Array) => Effect.Effect<Clip>;
    readonly oldest: Effect.Effect<Option.Option<Clip>>;
    readonly remove: (id: string) => Effect.Effect<void>;
    readonly size: Effect.Effect<number>;
  }
>()('buddy/Outbox') {}
