import type { Repository } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { PlanetNotFoundError } from '../errors.js';
import { GiteaOutbound, type LinkedRepository } from '../ports/gitea.outbound.port.js';
import { RepositoriesOutbound } from '../ports/repositories.outbound.port.js';

/**
 * A planet by its name, and the Gitea repository its `origin` names. The planet is only ever
 * one the repositories port lists, and the repository only ever the one its remote names.
 */
export const makeIssuePlanet = Effect.gen(function* () {
  const planetsOutbound = yield* RepositoriesOutbound;
  const giteaOutbound = yield* GiteaOutbound;

  return Effect.fnUntraced(function* (name: string) {
    const planets = yield* planetsOutbound.list;
    const planet = planets.find((candidate) => candidate.name === name);
    if (planet === undefined) return yield* new PlanetNotFoundError({ planet: name });
    const origin = yield* planetsOutbound.originUrl(planet);
    const repository = Option.flatMap(origin, giteaOutbound.repositoryOf);
    return { planet, repository } satisfies {
      readonly planet: Repository;
      readonly repository: Option.Option<LinkedRepository>;
    };
  });
});
