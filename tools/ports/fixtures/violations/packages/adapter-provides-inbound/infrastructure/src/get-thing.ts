import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { GetThingInbound } from '../../application/src/ports/thing.inbound.port.js';
import { ThingOutbound } from '../../application/src/ports/thing.outbound.port.js';

// Violation: an infrastructure layer that provides an inbound port.
export const layerFake = Layer.mergeAll(
  Layer.succeed(GetThingInbound, { get: Effect.succeed('fake') }),
  Layer.succeed(ThingOutbound, { find: Effect.succeed('fake') }),
);
