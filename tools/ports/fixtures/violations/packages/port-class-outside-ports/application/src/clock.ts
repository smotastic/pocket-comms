import { Context as C } from 'effect';
import type * as Effect from 'effect/Effect';

// Violation: a port class outside a port file, declared through an aliased import.
export class ClockOutbound extends C.Service<
  ClockOutbound,
  { readonly now: Effect.Effect<number> }
>()('port-class-outside-ports/application/ClockOutbound') {}
