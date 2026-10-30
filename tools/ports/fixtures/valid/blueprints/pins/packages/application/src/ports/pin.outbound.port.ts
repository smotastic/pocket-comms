import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

export class PinStoreOutbound extends Context.Service<
  PinStoreOutbound,
  { readonly pin: (id: string) => Effect.Effect<void> }
>()('pins/application/PinStoreOutbound') {}
