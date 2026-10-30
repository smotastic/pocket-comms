import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

// Violations: port classes outside a port file, in a namespace, a function and a class
// expression.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Nested {
  export class NamespaceOutbound extends Context.Service<
    NamespaceOutbound,
    { readonly now: Effect.Effect<number> }
  >()('port-class-outside-ports/application/NamespaceOutbound') {}
}

export const make = () => {
  class FunctionOutbound extends Context.Service<
    FunctionOutbound,
    { readonly now: Effect.Effect<number> }
  >()('port-class-outside-ports/application/FunctionOutbound') {}
  return FunctionOutbound;
};

export const ExpressionOutbound = class extends Context.Service<
  ExpressionOutbound,
  { readonly now: Effect.Effect<number> }
>()('port-class-outside-ports/application/ExpressionOutbound') {};
