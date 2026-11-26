import type { PlanetRegistry } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type * as Stream from 'effect/Stream';
import type { PlanetsStoreError } from '../errors.js';

/**
 * The planets the owner registered and their settings (spec 034, ADR 0018); none until the
 * server's first start seeds them. A registry that does not read counts as none.
 */
export class PlanetsOutbound extends Context.Service<
  PlanetsOutbound,
  {
    readonly load: Effect.Effect<Option.Option<PlanetRegistry>>;
    /** Keeps `registry` in place of the saved one. */
    readonly save: (registry: PlanetRegistry) => Effect.Effect<void, PlanetsStoreError>;
    /** One element after every save. */
    readonly changes: Stream.Stream<void>;
  }
>()('comms/application/PlanetsOutbound') {}
