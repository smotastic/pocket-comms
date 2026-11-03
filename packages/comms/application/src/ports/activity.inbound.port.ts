import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type * as Stream from 'effect/Stream';
import type { ActivityDto } from '../dto/activity.dto.js';
import { makeActivity } from '../use-cases/activity.use-case.js';

// The inbound port of the activity timeline (ADR 0006, spec 017). The server holds one for its
// lifetime: the recorder that watches Herdr runs in the layer's scope.

export class ActivityInbound extends Context.Service<
  ActivityInbound,
  {
    readonly activity: Effect.Effect<ActivityDto>;
    /** The timeline at once and after every change; an unchanged one is not repeated. */
    readonly activityChanges: Stream.Stream<ActivityDto>;
  }
>()('comms/application/ActivityInbound') {
  static readonly layer = Layer.effect(ActivityInbound, makeActivity);
}
