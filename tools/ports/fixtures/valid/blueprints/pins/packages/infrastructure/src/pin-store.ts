import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { PinStoreOutbound } from '../../application/src/ports/pin.outbound.port.js';

export const layerInMemory = Layer.succeed(PinStoreOutbound, { pin: () => Effect.void });
