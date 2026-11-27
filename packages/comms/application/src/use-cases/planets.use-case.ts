import {
  chooseAutonomy,
  effectiveAutonomy,
  allowApps,
  lastDeploy,
  pausingDeploy,
  releaseSettingsOf,
  type DeployFacts,
  type LastDeployFacts,
  type AutonomyLevel,
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
import { DeployOutbound } from '../ports/deploy.outbound.port.js';
import { MissionBotOutbound } from '../ports/mission-bot.outbound.port.js';
import { MissionsOutbound } from '../ports/missions.outbound.port.js';
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
  const missionBot = yield* MissionBotOutbound;
  const deployOutbound = yield* DeployOutbound;
  const missionsOutbound = yield* MissionsOutbound;
  const { split, registry, find } = yield* makePlanetRegistry;
  const reused = yield* Ref.make(
    new Map<
      string,
      { readonly at: number; readonly preflight: Preflight; readonly deployKey: string }
    >(),
  );

  /**
   * What the planet's latest deploy is now, so a new failure or a Resume is seen at once rather
   * than after the reuse time (spec 037, requirement 9), and so are its allowed apps.
   */
  const deployKeyOf = (name: string) =>
    Effect.gen(function* () {
      const latest = lastDeploy(yield* missionsOutbound.load, name);
      const apps = (yield* registry).planets.find((settings) => settings.name === name)?.apps;
      return JSON.stringify([latest?.id, latest?.state, latest?.fixIssue, latest?.resumedAt, apps]);
    });

  /** The facts of a planet's repository on Gitea; a Gitea that cannot be read is a fact too. */
  /** The deploy checks' facts: the AGENTS.md block, and the script on each app it names. */
  const deployFacts = (planet: string, agentsMd: string | undefined) =>
    Effect.gen(function* () {
      const allowed =
        (yield* registry).planets.find((settings) => settings.name === planet)?.apps ?? [];
      const settings = releaseSettingsOf(agentsMd);
      const apps =
        settings._tag === 'Settings'
          ? [
              ...new Set(
                settings.settings.releases.flatMap((release) =>
                  release.app === undefined ? [] : [release.app],
                ),
              ),
            ]
          : [];
      return {
        planet,
        allowed,
        settings,
        script: deployOutbound.configured,
        apps: deployOutbound.configured
          ? yield* Effect.forEach(apps, deployOutbound.check, { concurrency: 'unbounded' })
          : [],
      } satisfies DeployFacts;
    });

  /**
   * The planet's latest deploy: a failed one pauses it until its fix issue is closed or the owner
   * resumes it (spec 037).
   */
  const lastDeployFacts = (planet: string, repository: LinkedRepository) =>
    Effect.gen(function* () {
      const latest = pausingDeploy(yield* missionsOutbound.load, planet);
      if (latest === undefined) return { _tag: 'Fine' } satisfies LastDeployFacts;
      const what = (latest.versions ?? []).join(', ') || `#${latest.issue.number}`;
      const how =
        latest.state === 'down'
          ? 'is down'
          : latest.state === 'deploy-lost'
            ? 'was lost'
            : latest.state === 'failed'
              ? 'failed'
              : 'rolled back';
      const fixIssue = latest.fixIssue;
      if (fixIssue !== undefined) {
        const issue = yield* giteaOutbound.issue(repository, fixIssue).pipe(Effect.option);
        if (Option.isSome(issue) && issue.value.state !== 'open') {
          return { _tag: 'Fine' } satisfies LastDeployFacts;
        }
      }
      return { _tag: 'RolledBack', what, fixIssue, how } satisfies LastDeployFacts;
    });

  const factsOf = (planet: string, repository: LinkedRepository) =>
    Effect.gen(function* () {
      const branch = yield* giteaOutbound.defaultBranch(repository);
      if (Option.isNone(branch)) {
        return {
          _tag: 'Unreadable',
          reason: `Gitea has no repository ${repository.owner}/${repository.name}, or the token cannot read it.`,
        } satisfies PreflightFacts;
      }
      const ref = branch.value;
      const [agentsMd, agentsMdText, workflows, runs, packageJson] = yield* Effect.all(
        [
          giteaOutbound.entryNames(repository, ref, 'AGENTS.md'),
          giteaOutbound.fileText(repository, ref, 'AGENTS.md'),
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
        bot: yield* missionBot.facts(repository),
        deploy: yield* deployFacts(planet, Option.getOrUndefined(agentsMdText)),
        lastDeploy: yield* lastDeployFacts(planet, repository),
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
      Option.isNone(repository)
        ? { _tag: 'NotOnGitea' }
        : yield* factsOf(planet.name, repository.value),
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

  /** The planet's preflight; `fresh` computes it again without reusing it (spec 035). */
  const preflight = Effect.fn('Planets.preflight')(function* (name: string, fresh = false) {
    const planet = yield* find(name);
    const now = yield* Clock.currentTimeMillis;
    const deployKey = yield* deployKeyOf(name);
    const kept = fresh ? undefined : (yield* Ref.get(reused)).get(name);
    const computed =
      kept !== undefined && now - kept.at < PREFLIGHT_REUSE_MS && kept.deployKey === deployKey
        ? kept
        : { at: now, preflight: yield* compute(planet), deployKey };
    if (computed !== kept) {
      yield* Ref.update(reused, (map) => new Map(map).set(name, computed));
    }
    const chosen =
      (yield* registry).planets.find((settings) => settings.name === name)?.autonomy ?? 'manual';
    return {
      result: computed.preflight.result,
      checks: computed.preflight.checks,
      autonomy: {
        chosen,
        effective: effectiveAutonomy(
          chosen,
          computed.preflight.result,
          computed.preflight.deploy.deploys,
        ),
      },
      deploy: computed.preflight.deploy,
      checkedAt: computed.at,
    } satisfies PreflightDto;
  });

  /** Sets the planet's chosen autonomy level (spec 035, autopilot since spec 038). */
  const choose = Effect.fn('Planets.choose')(function* (name: string, level: AutonomyLevel) {
    const { registry } = yield* split;
    if (!registry.planets.some((planet) => planet.name === name)) {
      return yield* new PlanetNotFoundError({ planet: name });
    }
    const next = chooseAutonomy(registry, name, level);
    if (next === undefined) return yield* new PlanetNotFoundError({ planet: name });
    yield* planetsOutbound.save(next);
  });

  /** Sets the apps the planet's releases may deploy (spec 037, requirement 15). */
  const allow = Effect.fn('Planets.allowApps')(function* (
    name: string,
    apps: ReadonlyArray<string>,
  ) {
    const { registry } = yield* split;
    const next = allowApps(registry, name, apps);
    if (next === undefined) return yield* new PlanetNotFoundError({ planet: name });
    yield* planetsOutbound.save(next);
  });

  return { list: list(), register, unregister, preflight, choose, allowApps: allow };
});
