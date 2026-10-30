import * as Context from 'effect/Context';
import * as Layer from 'effect/Layer';

export class Cache extends Context.Service<Cache, Map<string, string>>()(
  'adapter-no-port/infrastructure/Cache',
) {}

// Violation: an adapter layer that provides no outbound port.
export const layerCache = Layer.sync(Cache, () => new Map());
