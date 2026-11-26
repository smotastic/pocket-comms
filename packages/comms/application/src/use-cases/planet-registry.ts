import { seedPlanets, type PlanetRegistry, type Repository } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { PlanetNotFoundError } from '../errors.js';
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { PlanetsOutbound } from '../ports/planets.outbound.port.js';
import { RepositoriesOutbound } from '../ports/repositories.outbound.port.js';

// Which repositories below the root are planets (spec 034): the registry decides, and only a
// planet is offered for work. The registry is seeded once, when the server starts without one.

const EMPTY: PlanetRegistry = { planets: [] };

export const makePlanetRegistry = Effect.gen(function* () {
  const planetsOutbound = yield* PlanetsOutbound;
  const repositoriesOutbound = yield* RepositoriesOutbound;
  const giteaOutbound = yield* GiteaOutbound;

  const registry = planetsOutbound.load.pipe(Effect.map(Option.getOrElse(() => EMPTY)));

  /** The repositories below the root that are planets, and the ones that are not. */
  const split = Effect.gen(function* () {
    const { planets } = yield* registry;
    const names = new Set(planets.map((planet) => planet.name));
    const repositories = yield* repositoriesOutbound.list;
    return {
      registry: { planets },
      planets: repositories.filter((repository) => names.has(repository.name)),
      others: repositories.filter((repository) => !names.has(repository.name)),
    };
  });

  const planets = Effect.map(split, (all) => all.planets);

  /** The planet named `name`; only a registered repository below the root is one. */
  const find = Effect.fnUntraced(function* (name: string) {
    const planet = (yield* planets).find((candidate: Repository) => candidate.name === name);
    if (planet === undefined) return yield* new PlanetNotFoundError({ planet: name });
    return planet;
  });

  /** Registers the repositories on the app's Gitea once, when there is no registry yet. */
  const seed = Effect.gen(function* () {
    if (Option.isSome(yield* planetsOutbound.load)) return;
    const repositories = yield* repositoriesOutbound.list;
    const seeded = seedPlanets(
      yield* Effect.forEach(repositories, (repository) =>
        repositoriesOutbound.originUrl(repository).pipe(
          Effect.map((origin) => ({
            name: repository.name,
            onGitea: Option.isSome(Option.flatMap(origin, giteaOutbound.repositoryOf)),
          })),
        ),
      ),
    );
    yield* planetsOutbound.save(seeded);
    yield* Effect.logInfo('Planets seeded').pipe(
      Effect.annotateLogs({ planets: seeded.planets.map((planet) => planet.name).join(', ') }),
    );
  }).pipe(Effect.withSpan('Planets.seed'));

  return { registry, split, planets, find, seed, changes: planetsOutbound.changes };
});
