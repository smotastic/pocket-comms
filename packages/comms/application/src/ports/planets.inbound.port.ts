import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { PlanetsDto } from '../dto/task.dto.js';
import type {
  MultiplexerUnavailableError,
  PlanetExistsError,
  PlanetNotFoundError,
  PlanetsStoreError,
  RepositoryNotFoundError,
} from '../errors.js';
import { makePlanets } from '../use-cases/planets.use-case.js';

// The inbound port of the planets resource (spec 034): the repositories the owner registered,
// registering and unregistering them.

export class PlanetsInbound extends Context.Service<
  PlanetsInbound,
  {
    readonly list: Effect.Effect<PlanetsDto, MultiplexerUnavailableError>;
    readonly register: (
      name: string,
    ) => Effect.Effect<void, PlanetExistsError | RepositoryNotFoundError | PlanetsStoreError>;
    readonly unregister: (
      name: string,
    ) => Effect.Effect<void, PlanetNotFoundError | PlanetsStoreError>;
  }
>()('comms/application/PlanetsInbound') {
  static readonly layer = Layer.effect(PlanetsInbound, makePlanets);
}
