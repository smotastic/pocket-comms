import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

// Violation: an inbound port without its use case layer.
export class CreateThingInbound extends Context.Service<
  CreateThingInbound,
  { readonly create: Effect.Effect<void> }
>()('inbound-without-layer/application/CreateThingInbound') {}
