import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type { QuickRepliesStoreError } from '../errors.js';

/** The owner's quick replies, kept across restarts; none until the owner first saves them. */
export class QuickRepliesOutbound extends Context.Service<
  QuickRepliesOutbound,
  {
    readonly load: Effect.Effect<Option.Option<ReadonlyArray<string>>, QuickRepliesStoreError>;
    /** Keeps `replies` in place of the saved ones. */
    readonly save: (replies: ReadonlyArray<string>) => Effect.Effect<void, QuickRepliesStoreError>;
  }
>()('comms/application/QuickRepliesOutbound') {}
