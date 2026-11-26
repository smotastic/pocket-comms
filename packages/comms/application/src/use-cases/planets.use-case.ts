import {
  effectiveAutonomy,
  orderPlanets,
  preflightOf,
  registerPlanet,
  unregisterPlanet,
  type Preflight,
  type PreflightFacts,
  type Repository,
} from '@pocket-comms/comms-domain';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Ref from 'effect/Ref';
import type { PlanetDto, PlanetsDto, PreflightDto } from '../dto/task.dto.js';
import { PlanetExistsError, PlanetNotFoundError, RepositoryNotFoundError } from '../errors.js';
import { GiteaOutbound, type LinkedRepository } from '../ports/gitea.outbound.port.js';
import { MultiplexerOutbound } from '../ports/multiplexer.outbound.port.js';
import { RepositoriesOutbound } from '../ports/repositories.outbound.port.js';
import { PlanetsOutbound } from '../ports/planets.outbound.port.js';
import { makePlanetRegistry } from './planet-registry.js';

/** How long a planet's preflight is reused before Gitea is read again (spec 034). */
export const PREFLIGHT_REUSE_MS = 60_000;

const WORKFLOW_FOLDERS = ['.gitea/workflows', '.github/workflows'];
const isWorkflow = (name: string) => name.endsWith('.yml') || name.endsWith('.yaml');

/**
 * The planets in the order the app offers them, open in Herdr first, and the repositories below
 * the root that are not planets; registering and unregistering (spec 034).
 */
export const makePlanets = Effect.gen(function* () {
  const planetsOutbound = yield* PlanetsOutbound;
  const herdrOutbound = yield* MultiplexerOutbound;
  const repositoriesOutbound = yield* RepositoriesOutbound;
  const giteaOutbound = yield* GiteaOutbound;
  const { split, registry, find } = yield* makePlanetRegistry;
  const reused = yield* Ref.make(
    new Map<string, { readonly at: number; readonly preflight: Preflight }>(),
  );

  /** The facts of a planet's repository on Gitea; a Gitea that cannot be read is a fact too. */
  const factsOf = (repository: LinkedRepository) =>
    Effect.gen(function* () {
      const branch = yield* giteaOutbound.defaultBranch(repository);
      if (Option.isNone(branch)) {
        return {
          _tag: 'Unreadable',
          reason: `Gitea has no repository ${repository.owner}/${repository.name}, or the token cannot read it.`,
        } satisfies PreflightFacts;
      }
      const ref = branch.value;
      const [agentsMd, workflows, runs, packageJson] = yield* Effect.all(
        [
          giteaOutbound.entryNames(repository, ref, 'AGENTS.md'),
          Effect.forEach(WORKFLOW_FOLDERS, (folder) =>
            giteaOutbound.entryNames(repository, ref, folder),
          ),
          giteaOutbound.pushRuns(repository, ref),
          giteaOutbound.fileText(repository, ref, 'package.json'),
        ],
        { concurrency: 'unbounded' },
      );
      return {
        _tag: 'Read',
        defaultBranch: ref,
        agentsMd: agentsMd.length > 0,
        workflows: workflows.flat().some(isWorkflow),
        runs: Option.getOrUndefined(runs),
        packageJson: Option.getOrUndefined(packageJson),
      } satisfies PreflightFacts;
    }).pipe(
      Effect.catchTags({
        GiteaNotConfiguredError: () =>
          Effect.succeed<PreflightFacts>({
            _tag: 'Unreadable',
            reason: 'The app has no Gitea token.',
          }),
        GiteaUnavailableError: (error) =>
          Effect.succeed<PreflightFacts>({ _tag: 'Unreadable', reason: error.reason }),
      }),
    );

  const compute = Effect.fnUntraced(function* (planet: Repository) {
    const origin = yield* repositoriesOutbound.originUrl(planet);
    const repository = Option.flatMap(origin, giteaOutbound.repositoryOf);
    return preflightOf(
      Option.isNone(repository) ? { _tag: 'NotOnGitea' } : yield* factsOf(repository.value),
    );
  });

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

  const preflight = Effect.fn('Planets.preflight')(function* (name: string) {
    const planet = yield* find(name);
    const now = yield* Clock.currentTimeMillis;
    const kept = (yield* Ref.get(reused)).get(name);
    const fresh =
      kept !== undefined && now - kept.at < PREFLIGHT_REUSE_MS
        ? kept
        : { at: now, preflight: yield* compute(planet) };
    if (fresh !== kept) {
      yield* Ref.update(reused, (map) => new Map(map).set(name, fresh));
    }
    const chosen =
      (yield* registry).planets.find((settings) => settings.name === name)?.autonomy ?? 'manual';
    return {
      result: fresh.preflight.result,
      checks: fresh.preflight.checks,
      autonomy: { chosen, effective: effectiveAutonomy(chosen, fresh.preflight.result) },
      checkedAt: fresh.at,
    } satisfies PreflightDto;
  });

  return { list: list(), register, unregister, preflight };
});
