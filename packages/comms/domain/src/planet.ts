import { OTHER_GROUP, type Workspace } from './workspace.js';
import type { ReleaseSettingsResult } from './release.js';

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
  /** The apps its releases may deploy (spec 037); none until the owner allows one. */
  readonly apps?: ReadonlyArray<string> | undefined;
}

/** The planets the owner registered, by name. */
export interface PlanetRegistry {
  readonly planets: ReadonlyArray<PlanetSettings>;
  /** Whether the allowed apps of the planets were seeded once (spec 037). */
  readonly appsSeeded?: boolean | undefined;
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
    : { ...registry, ...sorted([...registry.planets, { name, autonomy: 'manual' }]) };

/** The registry without `name` and its settings; none when it is not a planet. */
export const unregisterPlanet = (
  registry: PlanetRegistry,
  name: string,
): PlanetRegistry | undefined =>
  registry.planets.some((planet) => planet.name === name)
    ? { ...registry, planets: registry.planets.filter((planet) => planet.name !== name) }
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
        ...registry,
        planets: registry.planets.map((planet) =>
          planet.name === name ? { ...planet, autonomy: level } : planet,
        ),
      }
    : undefined;

/**
 * The apps today's planets may deploy, seeded once (spec 037, requirement 13): each deploys the
 * app of its own name, pocket-home its server and web app; every other planet none.
 */
export const SEEDED_APPS: Readonly<Record<string, ReadonlyArray<string>>> = {
  'pocket-comms': ['pocket-comms'],
  'pocket-lens': ['pocket-lens'],
  'pocket-coach': ['pocket-coach'],
  'pocket-galaxy': ['pocket-galaxy'],
  'pocket-learning': ['pocket-learning'],
  'pocket-home': ['pocket-home-server', 'pocket-home-web'],
};

/** The registry with the allowed apps seeded, once; none when they were seeded already. */
export const seedAllowedApps = (registry: PlanetRegistry): PlanetRegistry | undefined =>
  registry.appsSeeded === true
    ? undefined
    : {
        appsSeeded: true,
        planets: registry.planets.map((planet) => ({
          ...planet,
          apps: planet.apps ?? SEEDED_APPS[planet.name] ?? [],
        })),
      };

/** The registry with the planet's allowed apps set to `apps`; none when it is not a planet. */
export const allowApps = (
  registry: PlanetRegistry,
  name: string,
  apps: ReadonlyArray<string>,
): PlanetRegistry | undefined =>
  registry.planets.some((planet) => planet.name === name)
    ? {
        ...registry,
        planets: registry.planets.map((planet) =>
          planet.name === name ? { ...planet, apps: [...new Set(apps)].sort() } : planet,
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
      /** What the deploy checks read (spec 036). */
      readonly deploy: DeployFacts;
      /** The planet's latest deploy (spec 036). */
      readonly lastDeploy: LastDeployFacts;
    };

/** What the deploy checks read: the Mission Control block and pocket-cloud's deploy script. */
export interface DeployFacts {
  /** The releases of the AGENTS.md block, or why there are none. */
  readonly settings: ReleaseSettingsResult;
  /** Whether the server knows pocket-cloud's deploy script (`COMMS_DEPLOY_SCRIPT`). */
  readonly script: boolean;
  /** What the deploy script says of each app the releases name. */
  readonly apps: ReadonlyArray<{
    readonly app: string;
    readonly ready: boolean;
    readonly reason: string;
  }>;
  /** The planet's name and the apps the owner allows it to deploy (spec 037). */
  readonly planet: string;
  readonly allowed: ReadonlyArray<string>;
}

/** The planet's latest deploy, as the mission log and its fix issue say. */
export type LastDeployFacts =
  | { readonly _tag: 'Fine' }
  | {
      readonly _tag: 'RolledBack';
      readonly what: string;
      readonly fixIssue: number | undefined;
      /** How it failed, such as "rolled back" or "is down" (spec 037); "rolled back" when none. */
      readonly how?: string | undefined;
    };

/** Whether the mission bot may push to a repository and write its issues, as Gitea says. */
export type BotFacts =
  | { readonly _tag: 'NoToken' }
  | { readonly _tag: 'Unreadable'; readonly reason: string }
  | {
      readonly _tag: 'Read';
      readonly canPush: boolean;
      /** Whether the token has `write:issue`, for a mission's labels and comments. */
      readonly canWriteIssues: boolean;
    };

export const PREFLIGHT_CHECKS = [
  'gitea',
  'agents-md',
  'ci-workflow',
  'ci-green',
  'verify-script',
  'mission-bot',
  'last-deploy',
] as const;

/** The checks that decide whether a planet deploys; they never change go or no-go (spec 036). */
export const DEPLOY_CHECKS = ['release-settings', 'deploy-script', 'deploy-apps'] as const;

export type DeployCheckName = (typeof DEPLOY_CHECKS)[number];

export type PreflightCheckName = (typeof PREFLIGHT_CHECKS)[number];

export interface PreflightCheck {
  readonly check: PreflightCheckName | DeployCheckName;
  readonly passed: boolean;
  /** One sentence that says why. */
  readonly reason: string;
}

export type PreflightResult = 'go' | 'no-go';

export interface Preflight {
  readonly result: PreflightResult;
  readonly checks: ReadonlyArray<PreflightCheck>;
  /** Whether the planet deploys its missions, and why (spec 036). */
  readonly deploy: {
    readonly deploys: boolean;
    readonly checks: ReadonlyArray<PreflightCheck>;
    /** The apps its releases name, each allowed or not (spec 037). */
    readonly apps: ReadonlyArray<{ readonly app: string; readonly allowed: boolean }>;
  };
}

const lastDeploy = (facts: LastDeployFacts): Omit<PreflightCheck, 'check'> => {
  if (facts._tag === 'Fine') return { passed: true, reason: 'The last deploy did not roll back.' };
  const how = facts.how ?? 'rolled back';
  return {
    passed: false,
    reason:
      facts.fixIssue === undefined
        ? `The last deploy (${facts.what}) ${how}; resume the planet once it is fixed.`
        : `The last deploy (${facts.what}) ${how}; close #${facts.fixIssue} or resume the planet once it is fixed.`,
  };
};

/** The deploy checks of a planet (spec 036, requirement 3). */
export const deployChecksOf = (facts: DeployFacts): Preflight['deploy'] => {
  const settings = facts.settings;
  const apps =
    settings._tag === 'Settings'
      ? settings.settings.releases.flatMap((release) =>
          release.app === undefined ? [] : [release.app],
        )
      : [];
  const notReady = facts.apps.filter((each) => apps.includes(each.app) && !each.ready);
  const notAllowed = [...new Set(apps)].filter((app) => !facts.allowed.includes(app));
  const checks: ReadonlyArray<PreflightCheck> = [
    {
      check: 'release-settings',
      ...(settings._tag === 'Settings'
        ? {
            passed: true,
            reason: `AGENTS.md names ${settings.settings.releases.length === 1 ? 'one release' : `${settings.settings.releases.length} releases`}.`,
          }
        : { passed: false, reason: settings.reason }),
    },
    {
      check: 'deploy-script',
      ...(facts.script
        ? { passed: true, reason: "The server knows pocket-cloud's deploy script." }
        : {
            passed: false,
            reason: 'The server has no deploy script (COMMS_DEPLOY_SCRIPT).',
          }),
    },
    {
      check: 'deploy-apps',
      ...(settings._tag !== 'Settings'
        ? { passed: false, reason: 'Not checked: AGENTS.md names no release.' }
        : apps.length === 0
          ? { passed: true, reason: 'Its releases are published only; nothing to deploy.' }
          : notAllowed.length > 0
            ? {
                passed: false,
                reason: notAllowed
                  .map((app) => `${app} is not allowed for ${facts.planet}.`)
                  .join(' '),
              }
            : !facts.script
              ? { passed: false, reason: 'Not checked: the server has no deploy script.' }
              : notReady.length > 0
                ? { passed: false, reason: notReady.map((each) => each.reason).join(' ') }
                : apps.some((app) => !facts.apps.some((each) => each.app === app))
                  ? { passed: false, reason: 'The deploy script was not asked about every app.' }
                  : {
                      passed: true,
                      reason: `The deploy script can deploy, check and roll back ${apps.join(', ')}.`,
                    }),
    },
  ];
  return {
    deploys: checks.every((each) => each.passed),
    checks,
    apps: [...new Set(apps)].map((app) => ({ app, allowed: facts.allowed.includes(app) })),
  };
};

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
      if (!bot.canPush) {
        return { passed: false, reason: 'The mission bot may not push to the repository.' };
      }
      return bot.canWriteIssues
        ? {
            passed: true,
            reason: 'The mission bot may push to the repository and write its issues.',
          }
        : {
            passed: false,
            reason: "The mission bot's token lacks issue write access (write:issue).",
          };
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
      deploy: {
        deploys: false,
        checks: DEPLOY_CHECKS.map((check) => ({
          check,
          passed: false,
          reason: 'Not checked: Gitea cannot be read.',
        })),
        apps: [],
      },
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
    { check: 'last-deploy', ...lastDeploy(facts.lastDeploy) },
  ];
  return {
    result: checks.every((each) => each.passed) ? 'go' : 'no-go',
    checks,
    deploy: deployChecksOf(facts.deploy),
  };
};

/** The level in effect: the chosen one, lowered to `manual` on no-go; never raised. */
export const effectiveAutonomy = (chosen: AutonomyLevel, result: PreflightResult): AutonomyLevel =>
  result === 'go' ? chosen : 'manual';
