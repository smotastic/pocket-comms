import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { ThingOutbound } from '../../../../../packages/twin/application/src/ports/thing.outbound.port.js';

export const layerInMemory = Layer.succeed(ThingOutbound, { find: Effect.succeed('thing') });
