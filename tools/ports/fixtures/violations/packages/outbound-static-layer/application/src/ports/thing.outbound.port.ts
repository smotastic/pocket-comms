import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

// Violations: adapter layers on the port class, in each member form; adapters belong in
// infrastructure.
export class ThingOutbound extends Context.Service<
  ThingOutbound,
  { readonly find: Effect.Effect<string> }
>()('outbound-static-layer/application/ThingOutbound') {
  static readonly layerInMemory = Layer.succeed(ThingOutbound, { find: Effect.succeed('thing') });

  static get layerGetter() {
    return ThingOutbound.layerInMemory;
  }

  static layerMethod() {
    return ThingOutbound.layerInMemory;
  }

  static layerUnion: Layer.Layer<ThingOutbound> | Layer.Layer<ThingOutbound, Error> =
    ThingOutbound.layerInMemory;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static layerAny: any = ThingOutbound.layerInMemory;
}
