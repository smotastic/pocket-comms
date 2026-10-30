import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

// Violation: the key names another service.
export class ThingOutbound extends Context.Service<
  ThingOutbound,
  { readonly find: Effect.Effect<string> }
>()('other-service/application/ThingOutbound') {}
