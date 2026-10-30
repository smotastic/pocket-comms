import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

// Violation: no infrastructure layer of this service provides the port. The layer in
// `foreign-adapter` does not count, because it belongs to another service.
export class ThingOutbound extends Context.Service<
  ThingOutbound,
  { readonly find: Effect.Effect<string> }
>()('outbound-without-adapter/application/ThingOutbound') {}
