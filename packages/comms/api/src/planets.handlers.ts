import { PlanetsInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

/** Implements the `planets` group (spec 034); the wire shapes equal the application DTOs. */
export const planetsHandlers = HttpApiBuilder.group(
  CommsApi,
  'planets',
  Effect.fn(function* (handlers) {
    const planetsInbound = yield* PlanetsInbound;

    return handlers
      .handle('list', () =>
        planetsInbound.list.pipe(
          Effect.catchTags({ MultiplexerUnavailableError: problems.herdrUnavailable }),
        ),
      )
      .handle('register', ({ payload }) =>
        planetsInbound.register(payload.name).pipe(
          Effect.catchTags({
            RepositoryNotFoundError: problems.repositoryNotFound,
            PlanetExistsError: problems.planetExists,
            PlanetsStoreError: problems.planetsUnavailable,
          }),
        ),
      )
      .handle('preflight', ({ params }) =>
        planetsInbound
          .preflight(params.planet)
          .pipe(Effect.catchTags({ PlanetNotFoundError: problems.planetNotFound })),
      )
      .handle('chooseAutonomy', ({ params, payload }) =>
        planetsInbound.choose(params.planet, payload.level).pipe(
          Effect.catchTags({
            PlanetNotFoundError: problems.planetNotFound,
            InvalidInputError: problems.invalidInput,
            PlanetsStoreError: problems.planetsUnavailable,
          }),
        ),
      )
      .handle('allowApps', ({ params, payload }) =>
        planetsInbound.allowApps(params.planet, payload.apps).pipe(
          Effect.catchTags({
            PlanetNotFoundError: problems.planetNotFound,
            PlanetsStoreError: problems.planetsUnavailable,
          }),
        ),
      )
      .handle('unregister', ({ params }) =>
        planetsInbound.unregister(params.planet).pipe(
          Effect.catchTags({
            PlanetNotFoundError: problems.planetNotFound,
            PlanetsStoreError: problems.planetsUnavailable,
          }),
        ),
      );
  }),
);
