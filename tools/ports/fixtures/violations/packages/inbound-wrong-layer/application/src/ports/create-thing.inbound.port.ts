import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import { GetThingInbound } from './thing.inbound.port.js';

// Violation: the static `layer` provides another port, not this one.
export class CreateThingInbound extends Context.Service<
  CreateThingInbound,
  { readonly create: Effect.Effect<void> }
>()('inbound-wrong-layer/application/CreateThingInbound') {
  static readonly layer = GetThingInbound.layer;
}
