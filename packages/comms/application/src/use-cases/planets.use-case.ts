import { orderPlanets, registerPlanet, unregisterPlanet } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import type { PlanetDto, PlanetsDto } from '../dto/task.dto.js';
import { PlanetExistsError, PlanetNotFoundError, RepositoryNotFoundError } from '../errors.js';
import { MultiplexerOutbound } from '../ports/multiplexer.outbound.port.js';
import { PlanetsOutbound } from '../ports/planets.outbound.port.js';
import { makePlanetRegistry } from './planet-registry.js';

/**
 * The planets in the order the app offers them, open in Herdr first, and the repositories below
 * the root that are not planets; registering and unregistering (spec 034).
 */
export const makePlanets = Effect.gen(function* () {
  const planetsOutbound = yield* PlanetsOutbound;
  const herdrOutbound = yield* MultiplexerOutbound;
  const { split } = yield* makePlanetRegistry;

  const list = Effect.fn('Planets.list')(function* () {
    const { planets, others } = yield* split;
    const { workspaces } = yield* herdrOutbound.snapshot;
    return {
      planets: orderPlanets(planets, workspaces).map(
        ({ name, open }): PlanetDto => ({ name, open }),
      ),
      others: others.map((repository) => repository.name),
    } satisfies PlanetsDto;
  });

  const register = Effect.fn('Planets.register')(function* (name: string) {
    const { registry, others, planets } = yield* split;
    if (planets.some((planet) => planet.name === name)) {
      return yield* new PlanetExistsError({ planet: name });
    }
    if (!others.some((repository) => repository.name === name)) {
      return yield* new RepositoryNotFoundError({ name });
    }
    const next = registerPlanet(registry, name);
    if (next === undefined) return yield* new PlanetExistsError({ planet: name });
    yield* planetsOutbound.save(next);
  });

  const unregister = Effect.fn('Planets.unregister')(function* (name: string) {
    const { registry } = yield* split;
    const next = unregisterPlanet(registry, name);
    if (next === undefined) return yield* new PlanetNotFoundError({ planet: name });
    yield* planetsOutbound.save(next);
  });

  return { list: list(), register, unregister };
});
