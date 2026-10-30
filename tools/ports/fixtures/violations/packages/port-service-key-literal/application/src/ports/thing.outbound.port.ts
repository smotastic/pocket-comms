import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

const key = 'port-service-key-literal/application/ThingOutbound';

// Violation: the key is not a string literal.
export class ThingOutbound extends Context.Service<
  ThingOutbound,
  { readonly find: Effect.Effect<string> }
>()(key) {}
