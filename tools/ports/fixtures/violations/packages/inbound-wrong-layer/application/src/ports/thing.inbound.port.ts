import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

export class GetThingInbound extends Context.Service<
  GetThingInbound,
  { readonly get: Effect.Effect<string> }
>()('inbound-wrong-layer/application/GetThingInbound') {
  static readonly layer = Layer.succeed(GetThingInbound, { get: Effect.succeed('thing') });
}
