import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

// Violation: the use case layer is a factory, not a `Layer` value.
export class CreateThingInbound extends Context.Service<
  CreateThingInbound,
  { readonly create: Effect.Effect<void> }
>()('inbound-layer-factory/application/CreateThingInbound') {
  static readonly layer = () => Layer.succeed(CreateThingInbound, { create: Effect.void });
}
