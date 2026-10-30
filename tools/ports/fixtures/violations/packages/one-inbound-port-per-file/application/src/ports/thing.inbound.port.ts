import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

export class GetThingInbound extends Context.Service<
  GetThingInbound,
  { readonly get: Effect.Effect<string> }
>()('one-inbound-port-per-file/application/GetThingInbound') {
  static readonly layer = Layer.succeed(GetThingInbound, { get: Effect.succeed('thing') });
}

// Violation: a second inbound port of the same resource; its method belongs in GetThingInbound.
export class DeleteThingInbound extends Context.Service<
  DeleteThingInbound,
  { readonly delete: Effect.Effect<void> }
>()('one-inbound-port-per-file/application/DeleteThingInbound') {
  static readonly layer = Layer.succeed(DeleteThingInbound, { delete: Effect.void });
}
