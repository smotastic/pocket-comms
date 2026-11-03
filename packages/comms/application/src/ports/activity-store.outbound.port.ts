import type { ActivityEvent } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Stream from 'effect/Stream';

/** Where the timeline's events are kept between server restarts (spec 017, requirement 7). */
export class ActivityStoreOutbound extends Context.Service<
  ActivityStoreOutbound,
  {
    /** The kept events, oldest first; none when nothing was kept or the kept file cannot be read. */
    readonly events: Effect.Effect<ReadonlyArray<ActivityEvent>>;
    /**
     * Replaces the events with what `change` makes of them, one update at a time, and keeps them.
     * A failed save is logged and the events go on in memory.
     */
    readonly update: (
      change: (events: ReadonlyArray<ActivityEvent>) => ReadonlyArray<ActivityEvent>,
    ) => Effect.Effect<void>;
    /** Emits after each update. */
    readonly changes: Stream.Stream<void>;
  }
>()('comms/application/ActivityStoreOutbound') {}
