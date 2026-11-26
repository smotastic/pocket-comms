import { describe, expect, it } from 'vitest';
import {
  effectiveAutonomy,
  planetWorkspaces,
  preflightOf,
  registerPlanet,
  seedPlanets,
  unregisterPlanet,
  type CiRun,
  type PreflightFacts,
} from './planet.js';
import { OTHER_GROUP, type Workspace } from './workspace.js';

const read = (
  overrides: Partial<Extract<PreflightFacts, { _tag: 'Read' }>> = {},
): PreflightFacts => ({
  _tag: 'Read',
  defaultBranch: 'master',
  agentsMd: true,
  workflows: true,
  runs: [{ status: 'completed', conclusion: 'success' }],
  packageJson: JSON.stringify({ scripts: { verify: 'pocket-ci verify' } }),
  ...overrides,
});

const check = (facts: PreflightFacts, name: string) =>
  preflightOf(facts).checks.find((candidate) => candidate.check === name);

describe('the seed', () => {
  it('registers the repositories on Gitea at manual, but never pocket-cloud or pocket-mission', () => {
    expect(
      seedPlanets([
        { name: 'pocket-home', onGitea: true },
        { name: 'pocket-cloud', onGitea: true },
        { name: 'pocket-mission', onGitea: true },
        { name: 'setup', onGitea: false },
      ]),
    ).toEqual({ planets: [{ name: 'pocket-home', autonomy: 'manual' }] });
  });
});

describe('registering', () => {
  const registry = { planets: [{ name: 'app', autonomy: 'manual' as const }] };

  it('adds a planet at manual, in name order', () => {
    expect(registerPlanet(registry, 'api')).toEqual({
      planets: [
        { name: 'api', autonomy: 'manual' },
        { name: 'app', autonomy: 'manual' },
      ],
    });
  });

  it('refuses a planet that is registered already', () => {
    expect(registerPlanet(registry, 'app')).toBeUndefined();
  });

  it('removes a planet with its settings, and refuses one that is not registered', () => {
    expect(unregisterPlanet(registry, 'app')).toEqual({ planets: [] });
    expect(unregisterPlanet(registry, 'api')).toBeUndefined();
  });
});

describe('the workspaces of planets', () => {
  const workspace = (id: string, planet?: string): Workspace => ({
    id,
    label: id,
    group: planet === undefined ? OTHER_GROUP : { key: `/${planet}/.git`, name: planet },
    ...(planet === undefined ? {} : { planet, root: `/${planet}` }),
  });

  it('keeps a planet, and puts a repository that is not one under Other', () => {
    expect(
      planetWorkspaces(
        [workspace('w1', 'app'), workspace('w2', 'setup'), workspace('w3')],
        new Set(['app']),
      ),
    ).toEqual([
      workspace('w1', 'app'),
      { id: 'w2', label: 'w2', group: OTHER_GROUP, root: '/setup' },
      workspace('w3'),
    ]);
  });
});

describe('preflight', () => {
  it('is go when every check passes, in the fixed order', () => {
    const preflight = preflightOf(read());
    expect(preflight.result).toBe('go');
    expect(preflight.checks.map(({ check, passed }) => [check, passed])).toEqual([
      ['gitea', true],
      ['agents-md', true],
      ['ci-workflow', true],
      ['ci-green', true],
      ['verify-script', true],
    ]);
  });

  it("fails every check when the planet is not on the app's Gitea", () => {
    const preflight = preflightOf({ _tag: 'NotOnGitea' });
    expect(preflight.result).toBe('no-go');
    expect(preflight.checks.every((each) => !each.passed)).toBe(true);
    expect(preflight.checks[0]?.reason).toBe("Its origin is not on the app's Gitea.");
    expect(preflight.checks[1]?.reason).toBe('Not checked: Gitea cannot be read.');
  });

  it('fails every check, with the reason, when Gitea cannot be read', () => {
    const preflight = preflightOf({ _tag: 'Unreadable', reason: 'Gitea cannot be reached.' });
    expect(preflight.result).toBe('no-go');
    expect(preflight.checks[0]?.reason).toBe('Gitea cannot be reached.');
    expect(preflight.checks.every((each) => !each.passed)).toBe(true);
  });

  it('fails without an AGENTS.md or a CI workflow', () => {
    expect(check(read({ agentsMd: false }), 'agents-md')).toEqual({
      check: 'agents-md',
      passed: false,
      reason: 'master has no AGENTS.md at its top level.',
    });
    expect(check(read({ workflows: false }), 'ci-workflow')?.passed).toBe(false);
    expect(preflightOf(read({ workflows: false })).result).toBe('no-go');
  });

  describe('CI green', () => {
    const runs = (...list: ReadonlyArray<CiRun>) => read({ runs: list });

    it('judges the newest finished run, a newer one still going shown but not counted', () => {
      const failed = check(
        runs({ status: 'running' }, { status: 'completed', conclusion: 'failure' }),
        'ci-green',
      );
      expect(failed).toEqual({
        check: 'ci-green',
        passed: false,
        reason: 'The newest finished run on master ended as failure; a newer run is still going.',
      });
      expect(
        check(
          runs({ status: 'waiting' }, { status: 'completed', conclusion: 'success' }),
          'ci-green',
        ),
      ).toEqual({
        check: 'ci-green',
        passed: true,
        reason: 'The newest finished run on master succeeded; a newer run is still going.',
      });
    });

    it('skips cancelled and skipped runs', () => {
      expect(
        check(
          runs(
            { status: 'completed', conclusion: 'cancelled' },
            { status: 'completed', conclusion: 'skipped' },
            { status: 'completed', conclusion: 'success' },
          ),
          'ci-green',
        )?.passed,
      ).toBe(true);
    });

    it('fails when no run has finished, or the runs cannot be read', () => {
      expect(check(runs({ status: 'running' }), 'ci-green')?.reason).toBe(
        'No CI run on master has finished yet.',
      );
      expect(check(read({ runs: undefined }), 'ci-green')).toEqual({
        check: 'ci-green',
        passed: false,
        reason: "Gitea does not list this planet's CI runs.",
      });
    });
  });

  describe('verify script', () => {
    it('fails without a package.json, an unreadable one, or one without a verify script', () => {
      expect(check(read({ packageJson: undefined }), 'verify-script')?.reason).toBe(
        'master has no package.json at its top level.',
      );
      expect(check(read({ packageJson: '{' }), 'verify-script')?.reason).toBe(
        'package.json on master is not JSON.',
      );
      expect(
        check(
          read({ packageJson: JSON.stringify({ scripts: { test: 'vitest' } }) }),
          'verify-script',
        ),
      ).toEqual({
        check: 'verify-script',
        passed: false,
        reason: 'package.json on master has no verify script.',
      });
    });
  });
});

describe('the effective autonomy level', () => {
  it('is the chosen level on go, and manual on no-go', () => {
    expect(effectiveAutonomy('missions', 'go')).toBe('missions');
    expect(effectiveAutonomy('missions', 'no-go')).toBe('manual');
    expect(effectiveAutonomy('manual', 'go')).toBe('manual');
  });
});
