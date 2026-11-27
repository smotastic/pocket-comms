import { describe, expect, it } from 'vitest';
import {
  bumpOf,
  latestTag,
  nextVersion,
  pathMatches,
  releasePlan,
  releaseSettingsOf,
  type Release,
  type ReleaseCommit,
} from './release.js';

const agentsMd = (block: string) =>
  `# AGENTS.md\n\nText.\n\n\`\`\`json mission-control\n${block}\n\`\`\`\n\nMore.\n`;

describe('releaseSettingsOf', () => {
  it('reads the releases and migration paths of the block', () => {
    const result = releaseSettingsOf(
      agentsMd(
        '{"releases":[{"tag":"coach-v","paths":["apps/"],"workflow":"release-coach.yml","app":"pocket-coach"},{"tag":"design-v"}],"migrations":["packages/*/migrations/"]}',
      ),
    );
    expect(result).toEqual({
      _tag: 'Settings',
      settings: {
        releases: [
          { tag: 'coach-v', paths: ['apps/'], workflow: 'release-coach.yml', app: 'pocket-coach' },
          { tag: 'design-v', paths: [], workflow: undefined, app: undefined },
        ],
        migrations: ['packages/*/migrations/'],
      },
    });
  });

  it.each([
    [undefined, 'no AGENTS.md'],
    ['# AGENTS.md\n', 'no `json mission-control` block'],
    [agentsMd('{nope'), 'not valid JSON'],
    [agentsMd('{"releases":[]}'), 'names no release'],
    [agentsMd('{"releases":[{"tag":""}]}'), 'no valid `tag`'],
    [agentsMd('{"releases":[{"tag":"a-v","app":3}]}'), 'a-v'],
    [agentsMd('{"releases":[{"tag":"a-v"},{"tag":"a-v"}]}'), 'share a tag'],
    [agentsMd('{"releases":[{"tag":"a-v"}],"migrations":"x"}'), 'not path patterns'],
  ])('says why %#', (text, reason) => {
    const result = releaseSettingsOf(text);
    expect(result._tag).toBe('Invalid');
    expect(result._tag === 'Invalid' ? result.reason : '').toContain(reason);
  });
});

describe('pathMatches', () => {
  it.each([
    ['apps/', 'apps/web/main.ts', true],
    ['apps', 'appsx/main.ts', false],
    ['packages/*/migrations/', 'packages/coach/migrations/0001.sql', true],
    ['packages/*/migrations/', 'packages/a/b/migrations/0001.sql', false],
    ['packages/**/migrations/', 'packages/a/b/migrations/0001.sql', true],
    ['packages/**/migrations/', 'packages/migrations/0001.sql', true],
    ['README.md', 'README.md', true],
    ['**', 'anything/at/all', true],
  ])('%s against %s is %s', (pattern, file, expected) => {
    expect(pathMatches(pattern, file)).toBe(expected);
  });
});

describe('bumpOf', () => {
  it.each([
    ['feat(web): add x', '', 'minor'],
    ['fix: y', '', 'patch'],
    ['perf(server): z', '', 'patch'],
    ['refactor!: drop z', '', 'breaking'],
    ['fix: y', 'Text.\n\nBREAKING CHANGE: the API moved', 'breaking'],
    ['docs: words', '', 'none'],
    ['Merge branch master', '', 'none'],
  ])('%s is %s', (subject, body, bump) => {
    expect(bumpOf({ subject, body })).toBe(bump);
  });
});

describe('versions', () => {
  it('takes the newest tag of the prefix', () => {
    expect(
      latestTag('coach-v', ['coach-v0.9.0', 'coach-v0.10.0', 'learning-v9.0.0', 'coach-vx']),
    ).toEqual({ tag: 'coach-v0.10.0', version: { major: 0, minor: 10, patch: 0 } });
    expect(latestTag('coach-v', [])).toBeUndefined();
  });

  it('bumps as conventional commits say, a breaking change below 1.0 by the minor number', () => {
    const v = { major: 0, minor: 4, patch: 2 };
    expect(nextVersion(v, 'patch')).toEqual({ major: 0, minor: 4, patch: 3 });
    expect(nextVersion(v, 'minor')).toEqual({ major: 0, minor: 5, patch: 0 });
    expect(nextVersion(v, 'breaking')).toEqual({ major: 0, minor: 5, patch: 0 });
    expect(nextVersion({ major: 2, minor: 1, patch: 0 }, 'breaking')).toEqual({
      major: 3,
      minor: 0,
      patch: 0,
    });
  });
});

describe('releasePlan', () => {
  const server: Release = { tag: 'home-server-v', paths: ['apps/server/'], app: 'home-server' };
  const web: Release = { tag: 'home-web-v', paths: ['apps/web/'], app: 'home-web' };
  const commit = (subject: string, ...files: Array<string>): ReleaseCommit => ({
    subject,
    body: '',
    files,
  });
  const last = { major: 0, minor: 9, patch: 0 };

  it('ships each release whose paths a bumping commit touches', () => {
    const commits = [commit('fix: a', 'apps/server/a.ts'), commit('docs: b', 'apps/web/b.md')];
    expect(
      releasePlan(
        [],
        [
          { release: server, last, commits },
          { release: web, last, commits },
        ],
      ),
    ).toEqual({
      _tag: 'Ship',
      releases: [
        { tag: 'home-server-v0.9.1', version: '0.9.1', workflow: undefined, app: 'home-server' },
      ],
    });
  });

  it('has nothing to release without a bump', () => {
    expect(
      releasePlan(
        [],
        [{ release: server, last, commits: [commit('refactor: a', 'apps/server/a.ts')] }],
      ),
    ).toEqual({ _tag: 'Nothing' });
  });

  it('starts from 0.0.0 before the first tag', () => {
    const plan = releasePlan(
      [],
      [
        {
          release: { tag: 'design-v', paths: [] },
          last: undefined,
          commits: [commit('feat: a', 'x')],
        },
      ],
    );
    expect(plan._tag === 'Ship' ? plan.releases[0]?.tag : '').toBe('design-v0.1.0');
  });

  it('stops for a breaking change or a migration, keeping what Deploy ships', () => {
    const breaking = releasePlan(
      [],
      [{ release: server, last, commits: [commit('feat!: a', 'apps/server/a.ts')] }],
    );
    expect(breaking).toEqual({
      _tag: 'Stop',
      reason: 'home-server-v0.10.0 holds a breaking change.',
      migration: false,
      releases: [
        { tag: 'home-server-v0.10.0', version: '0.10.0', workflow: undefined, app: 'home-server' },
      ],
    });
    const migration = releasePlan(
      ['apps/server/migrations/'],
      [{ release: server, last, commits: [commit('fix: a', 'apps/server/migrations/0002.sql')] }],
    );
    expect(migration._tag).toBe('Stop');
    expect(migration._tag === 'Stop' ? migration.reason : '').toContain('database migration');
    expect(migration._tag === 'Stop' ? migration.migration : false).toBe(true);
  });
});
