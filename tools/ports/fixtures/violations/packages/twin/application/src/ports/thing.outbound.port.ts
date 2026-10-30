import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

// Violation: only the blueprint of the same name provides the port, and it is another service.
export class ThingOutbound extends Context.Service<
  ThingOutbound,
  { readonly find: Effect.Effect<string> }
>()('twin/application/ThingOutbound') {}
