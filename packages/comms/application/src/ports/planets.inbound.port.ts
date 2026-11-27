import type { AutonomyLevel, InvalidInputError } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { PlanetsDto, PreflightDto } from '../dto/task.dto.js';
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
    /**
     * The planet's preflight, reused for 60 seconds; a Gitea that cannot be read makes it no-go,
     * never an error.
     */
    readonly preflight: (
      name: string,
      fresh?: boolean,
    ) => Effect.Effect<PreflightDto, PlanetNotFoundError>;
    /** Sets the planet's chosen autonomy level: manual or missions (spec 035). */
    readonly choose: (
      name: string,
      level: AutonomyLevel,
    ) => Effect.Effect<void, PlanetNotFoundError | InvalidInputError | PlanetsStoreError>;
  }
>()('comms/application/PlanetsInbound') {
  static readonly layer = Layer.effect(PlanetsInbound, makePlanets);
}
