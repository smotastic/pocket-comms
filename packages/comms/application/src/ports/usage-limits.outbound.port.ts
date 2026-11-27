import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

/**
 * The usage limits the missions' Claude reports through its status line (spec 038): by the id of
 * its conversation, when the reached limit resets, in epoch milliseconds. A conversation with no
 * reached limit is not in it; nothing that cannot be read counts.
 */
export class UsageLimitsOutbound extends Context.Service<
  UsageLimitsOutbound,
  {
    readonly limits: Effect.Effect<ReadonlyMap<string, number>>;
  }
>()('comms/application/UsageLimitsOutbound') {}
