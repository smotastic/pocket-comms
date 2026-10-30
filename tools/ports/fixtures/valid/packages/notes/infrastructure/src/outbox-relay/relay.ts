import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

/** A background layer: it provides no service and runs while the deployable serves. */
export const layerRelay = Layer.effectDiscard(Effect.forkScoped(Effect.never));
