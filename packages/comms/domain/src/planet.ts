import { OTHER_GROUP, type Workspace } from './workspace.js';

// The rules of planets and preflight (spec 034, ADR 0018): which repositories are planets, their
// settings, and the checklist that says whether a planet is ready for missions. Preflight is
// computed only from facts; nothing here reads them.

/** How much Mission Control may do on a planet alone. */
export type AutonomyLevel = 'manual' | 'missions' | 'autopilot';

/** A planet's settings, kept in the registry. */
export interface PlanetSettings {
  readonly name: string;
  /** The level the owner chose: `manual` or `missions` (spec 035); never `autopilot` yet. */
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

/** The levels the owner may choose; `autopilot` is coming. */
export const CHOOSABLE_LEVELS: ReadonlySet<AutonomyLevel> = new Set(['manual', 'missions']);

/**
 * The registry with the planet's chosen level set to `level`; none when it is not a planet or the
 * level cannot be chosen yet.
 */
export const chooseAutonomy = (
  registry: PlanetRegistry,
  name: string,
  level: AutonomyLevel,
): PlanetRegistry | undefined =>
  CHOOSABLE_LEVELS.has(level) && registry.planets.some((planet) => planet.name === name)
    ? {
        planets: registry.planets.map((planet) =>
          planet.name === name ? { ...planet, autonomy: level } : planet,
        ),
      }
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
      /** What the mission bot may do on the repository (spec 035). */
      readonly bot: BotFacts;
    };

/** Whether the mission bot may push to a repository, as its token on Gitea says. */
export type BotFacts =
  | { readonly _tag: 'NoToken' }
  | { readonly _tag: 'Unreadable'; readonly reason: string }
  | { readonly _tag: 'Read'; readonly canPush: boolean };

export const PREFLIGHT_CHECKS = [
  'gitea',
  'agents-md',
  'ci-workflow',
  'ci-green',
  'verify-script',
  'mission-bot',
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

const missionBot = (bot: BotFacts): Omit<PreflightCheck, 'check'> => {
  switch (bot._tag) {
    case 'NoToken':
      return { passed: false, reason: 'Missions have no bot token (COMMS_MISSION_GITEA_TOKEN).' };
    case 'Unreadable':
      return { passed: false, reason: bot.reason };
    case 'Read':
      return bot.canPush
        ? { passed: true, reason: 'The mission bot may push to the repository.' }
        : { passed: false, reason: 'The mission bot may not push to the repository.' };
  }
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
    { check: 'mission-bot', ...missionBot(facts.bot) },
  ];
  return { result: checks.every((each) => each.passed) ? 'go' : 'no-go', checks };
};

/** The level in effect: the chosen one, lowered to `manual` on no-go; never raised. */
export const effectiveAutonomy = (chosen: AutonomyLevel, result: PreflightResult): AutonomyLevel =>
  result === 'go' ? chosen : 'manual';
