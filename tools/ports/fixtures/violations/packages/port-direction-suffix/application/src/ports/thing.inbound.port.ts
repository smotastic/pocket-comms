import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

// Violation: the class name does not end in the direction of its file.
export class CreateThing extends Context.Service<
  CreateThing,
  { readonly create: Effect.Effect<void> }
>()('port-direction-suffix/application/CreateThing') {
  static readonly layer = Layer.succeed(CreateThing, { create: Effect.void });
}
