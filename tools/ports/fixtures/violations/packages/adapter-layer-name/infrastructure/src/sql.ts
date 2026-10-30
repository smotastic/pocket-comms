import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { ThingOutbound } from '../../application/src/ports/thing.outbound.port.js';

// Violation: an adapter layer name that is not `layer` or `layer<Tech>`.
export const sqlLayer = Layer.succeed(ThingOutbound, { find: Effect.succeed('thing') });
