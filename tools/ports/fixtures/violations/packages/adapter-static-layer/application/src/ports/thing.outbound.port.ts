import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

export class ThingOutbound extends Context.Service<
  ThingOutbound,
  { readonly find: Effect.Effect<string> }
>()('adapter-static-layer/application/ThingOutbound') {}
