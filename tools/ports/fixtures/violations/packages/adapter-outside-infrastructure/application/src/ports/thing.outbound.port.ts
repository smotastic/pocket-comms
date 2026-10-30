import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

// Violation: the only layer that provides the port is declared in application.
export class ThingOutbound extends Context.Service<
  ThingOutbound,
  { readonly find: Effect.Effect<string> }
>()('adapter-outside-infrastructure/application/ThingOutbound') {}
