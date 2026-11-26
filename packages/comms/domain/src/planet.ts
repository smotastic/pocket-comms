import { OTHER_GROUP, type Workspace } from './workspace.js';

// The rules of planets and preflight (spec 034, ADR 0018): which repositories are planets, their
// settings, and the checklist that says whether a planet is ready for missions. Preflight is
// computed only from facts; nothing here reads them.

/** How much Mission Control may do on a planet alone. */
export type AutonomyLevel = 'manual' | 'missions' | 'autopilot';

/** A planet's settings, kept in the registry. */
export interface PlanetSettings {
  readonly name: string;
  /** The level the owner chose; spec 034 only lets them choose `manual`. */
  readonly autonomy: AutonomyLevel;
}

/** The planets the owner registered, by name. */
export interface PlanetRegistry {
  readonly planets: ReadonlyArray<PlanetSettings>;
}

/** The repositories the one-time seed never registers. */
export const LEFT_OUT_OF_SEED: ReadonlySet<string> = new Set(['pocket-cloud', 'pocket-mission']);

const sorted = (planets: ReadonlyArray<PlanetSettings>): PlanetRegistry => ({
  planets: [...planets].sort((a, b) => a.name.localeCompare(b.name)),
});

/**
 * The registry the server starts with when it has none: every repository whose `origin` is on the
 * app's Gitea, except the ones left out, at `manual`.
 */
export const seedPlanets = (
  repositories: ReadonlyArray<{ readonly name: string; readonly onGitea: boolean }>,
): PlanetRegistry =>
  sorted(
    repositories
      .filter((repository) => repository.onGitea && !LEFT_OUT_OF_SEED.has(repository.name))
      .map((repository) => ({ name: repository.name, autonomy: 'manual' })),
  );

/** The registry with `name` added at `manual`; none when it is a planet already. */
export const registerPlanet = (
  registry: PlanetRegistry,
  name: string,
): PlanetRegistry | undefined =>
  registry.planets.some((planet) => planet.name === name)
    ? undefined
    : sorted([...registry.planets, { name, autonomy: 'manual' }]);

/** The registry without `name` and its settings; none when it is not a planet. */
export const unregisterPlanet = (
  registry: PlanetRegistry,
  name: string,
): PlanetRegistry | undefined =>
  registry.planets.some((planet) => planet.name === name)
    ? { planets: registry.planets.filter((planet) => planet.name !== name) }
    : undefined;

/** The workspaces with every one on a repository that is not a planet moved to Other. */
export const planetWorkspaces = (
  workspaces: ReadonlyArray<Workspace>,
  planets: ReadonlySet<string>,
): ReadonlyArray<Workspace> =>
  workspaces.map((workspace) => {
    if (workspace.planet === undefined || planets.has(workspace.planet)) return workspace;
    const { planet: _repository, ...rest } = workspace;
    return { ...rest, group: OTHER_GROUP };
  });

/** One run of a planet's CI for a push, as Gitea lists it. */
export interface CiRun {
  /** `completed` once it ended; anything else means it is still going. */
  readonly status: string;
  /** How a completed run ended, such as `success`, `failure` or `cancelled`. */
  readonly conclusion?: string;
}

/** What preflight is computed from, read from the planet's default branch on Gitea. */
export type PreflightFacts =
  | { readonly _tag: 'NotOnGitea' }
  | { readonly _tag: 'Unreadable'; readonly reason: string }
  | {
      readonly _tag: 'Read';
      readonly defaultBranch: string;
      readonly agentsMd: boolean;
      readonly workflows: boolean;
      /** The push runs on the default branch, newest first; none when Gitea does not list them. */
      readonly runs: ReadonlyArray<CiRun> | undefined;
      /** The text of the top-level `package.json`; none when there is none. */
      readonly packageJson: string | undefined;
    };

export const PREFLIGHT_CHECKS = [
  'gitea',
  'agents-md',
  'ci-workflow',
  'ci-green',
  'verify-script',
] as const;

export type PreflightCheckName = (typeof PREFLIGHT_CHECKS)[number];

export interface PreflightCheck {
  readonly check: PreflightCheckName;
  readonly passed: boolean;
  /** One sentence that says why. */
  readonly reason: string;
}

export type PreflightResult = 'go' | 'no-go';

export interface Preflight {
  readonly result: PreflightResult;
  readonly checks: ReadonlyArray<PreflightCheck>;
}

const IGNORED_CONCLUSIONS: ReadonlySet<string> = new Set(['cancelled', 'skipped']);

const ciGreen = (
  branch: string,
  runs: ReadonlyArray<CiRun> | undefined,
): Omit<PreflightCheck, 'check'> => {
  if (runs === undefined) {
    return { passed: false, reason: "Gitea does not list this planet's CI runs." };
  }
  const finished = runs.findIndex(
    (run) => run.status === 'completed' && !IGNORED_CONCLUSIONS.has(run.conclusion ?? ''),
  );
  const run = runs[finished];
  if (run === undefined) {
    return { passed: false, reason: `No CI run on ${branch} has finished yet.` };
  }
  const going = runs.slice(0, finished).some((newer) => newer.status !== 'completed');
  const still = going ? '; a newer run is still going' : '';
  return run.conclusion === 'success'
    ? { passed: true, reason: `The newest finished run on ${branch} succeeded${still}.` }
    : {
        passed: false,
        reason: `The newest finished run on ${branch} ended as ${run.conclusion ?? 'unknown'}${still}.`,
      };
};

const verifyScript = (
  branch: string,
  packageJson: string | undefined,
): Omit<PreflightCheck, 'check'> => {
  if (packageJson === undefined) {
    return { passed: false, reason: `${branch} has no package.json at its top level.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(packageJson);
  } catch {
    return { passed: false, reason: `package.json on ${branch} is not JSON.` };
  }
  const scripts =
    typeof parsed === 'object' && parsed !== null && 'scripts' in parsed
      ? parsed.scripts
      : undefined;
  const verify =
    typeof scripts === 'object' && scripts !== null && 'verify' in scripts
      ? scripts.verify
      : undefined;
  return typeof verify === 'string' && verify.trim() !== ''
    ? { passed: true, reason: `package.json on ${branch} has a verify script.` }
    : { passed: false, reason: `package.json on ${branch} has no verify script.` };
};

/** Preflight of a planet: every check with its reason, go only when every check passes. */
export const preflightOf = (facts: PreflightFacts): Preflight => {
  if (facts._tag !== 'Read') {
    const reason =
      facts._tag === 'NotOnGitea' ? "Its origin is not on the app's Gitea." : facts.reason;
    return {
      result: 'no-go',
      checks: PREFLIGHT_CHECKS.map((check) => ({
        check,
        passed: false,
        reason: check === 'gitea' ? reason : 'Not checked: Gitea cannot be read.',
      })),
    };
  }
  const branch = facts.defaultBranch;
  const checks: ReadonlyArray<PreflightCheck> = [
    { check: 'gitea', passed: true, reason: "The repository is on the app's Gitea." },
    {
      check: 'agents-md',
      ...(facts.agentsMd
        ? { passed: true, reason: `${branch} has an AGENTS.md.` }
        : { passed: false, reason: `${branch} has no AGENTS.md at its top level.` }),
    },
    {
      check: 'ci-workflow',
      ...(facts.workflows
        ? { passed: true, reason: `${branch} has a CI workflow.` }
        : {
            passed: false,
            reason: `${branch} has no workflow in .gitea/workflows or .github/workflows.`,
          }),
    },
    { check: 'ci-green', ...ciGreen(branch, facts.runs) },
    { check: 'verify-script', ...verifyScript(branch, facts.packageJson) },
  ];
  return { result: checks.every((each) => each.passed) ? 'go' : 'no-go', checks };
};

/** The level in effect: the chosen one, lowered to `manual` on no-go; never raised. */
export const effectiveAutonomy = (chosen: AutonomyLevel, result: PreflightResult): AutonomyLevel =>
  result === 'go' ? chosen : 'manual';
