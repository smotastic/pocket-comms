import { describe, expect, it } from '@effect/vitest';
import type { Agent } from './agent.js';
import {
  issueBranch,
  issueNumberOf,
  issueTask,
  MAX_ISSUE_DESCRIPTION,
  orderIssues,
  parseRemote,
  workOnIssues,
  type Issue,
} from './issue.js';
import { MAX_TASK_LENGTH, parseBranch } from './task.js';

const issue = (overrides: Partial<Issue> & Pick<Issue, 'number'>): Issue => ({
  title: 'An issue',
  body: '',
  labels: [],
  updatedAt: 0,
  url: `http://localhost:3000/smotastic/pocket-comms/issues/${overrides.number}`,
  state: 'open',
  pull: false,
  ...overrides,
});

const agent = (paneId: string, cwd: string | undefined): Agent => ({
  paneId,
  name: `agent-${paneId}`,
  kind: 'claude',
  status: 'working',
  title: '',
  workspaceId: 'w1',
  cwd,
  session: undefined,
  completion: undefined,
});

describe('parseRemote', () => {
  it.each([
    ['gitea:smotastic/pocket-comms.git', 'gitea', 'smotastic', 'pocket-comms'],
    ['git@gitea:smotastic/pocket-comms', 'gitea', 'smotastic', 'pocket-comms'],
    ['ssh://git@localhost:2222/a/b.git', 'localhost', 'a', 'b'],
    ['ssh://LOCALHOST/a/b', 'localhost', 'a', 'b'],
    ['http://localhost:3000/a/b', 'localhost', 'a', 'b'],
    ['https://git.example.com/gitea/a/b.git/', 'git.example.com', 'a', 'b'],
    ['git@github.com:a/b.git', 'github.com', 'a', 'b'],
  ])('reads %s', (url, host, owner, name) => {
    expect(parseRemote(url)).toEqual({ host, owner, name });
  });

  it.each(['', '/Users/me/projects/app', '../app.git', 'file:///srv/app.git', 'gitea:onlyrepo'])(
    'reads no repository from %j',
    (url) => {
      expect(parseRemote(url)).toBeUndefined();
    },
  );
});

describe('orderIssues', () => {
  it('drops pull requests and puts the most recently updated first', () => {
    const ordered = orderIssues([
      issue({ number: 3, updatedAt: 100 }),
      issue({ number: 4, updatedAt: 300, pull: true }),
      issue({ number: 5, updatedAt: 200 }),
      issue({ number: 6, updatedAt: 100 }),
    ]);

    expect(ordered.map((each) => each.number)).toEqual([5, 6, 3]);
  });
});

describe('issueBranch', () => {
  it('takes the type of a conventional title and leaves its prefix out', () => {
    expect(issueBranch(issue({ number: 8, title: 'feat: per-project Gitea issue list' }))).toBe(
      'feat/8-per-project-gitea-issue-list',
    );
    expect(issueBranch(issue({ number: 9, title: 'docs(comms): explain the token' }))).toBe(
      'docs/9-explain-the-token',
    );
  });

  it('makes a bug a fix', () => {
    expect(issueBranch(issue({ number: 12, title: 'Login breaks', labels: ['Bug'] }))).toBe(
      'fix/12-login-breaks',
    );
    expect(issueBranch(issue({ number: 13, title: 'Fix the redirect' }))).toBe(
      'fix/13-fix-the-redirect',
    );
  });

  it('makes everything else a feature, keeping an unknown prefix as words', () => {
    expect(issueBranch(issue({ number: 7, title: 'WIP: Dark mode für Ärzte' }))).toBe(
      'feat/7-wip-dark-mode-fur-arzte',
    );
  });

  it('cuts the description at a word and keeps the number', () => {
    const branch = issueBranch(
      issue({
        number: 1234,
        title: 'Show the open issues of every project with their labels and age',
      }),
    );

    expect(branch).toBe('feat/1234-show-the-open-issues-of-every');
    expect(branch.length - 'feat/'.length).toBeLessThanOrEqual(MAX_ISSUE_DESCRIPTION);
  });

  it('suggests a branch the server accepts, even for a title without words', () => {
    expect(issueBranch(issue({ number: 2, title: '🚀 !!!' }))).toBe('feat/2-issue');
    expect(issueBranch(issue({ number: 3, title: 'x'.repeat(60) }))).toBe(
      `feat/3-${'x'.repeat(MAX_ISSUE_DESCRIPTION - 2)}`,
    );
    for (const title of ['feat: x', '🚀', 'a'.repeat(100), 'Fix: it']) {
      expect(parseBranch(issueBranch(issue({ number: 99999, title })))).toHaveProperty(
        '_tag',
        'Success',
      );
    }
  });
});

describe('issueNumberOf', () => {
  it.each([
    ['feat/8-per-project-gitea-issue-list', 8],
    ['fix/12-login', 12],
    ['chore/3-x', 3],
  ])('reads the issue of %s', (branch, number) => {
    expect(issueNumberOf(branch)).toBe(number);
  });

  it.each(['feat/new-task', 'feat/8', 'wip/8-x', 'feat/x-8-y', 'master', 'feat/08x-y'])(
    'reads no issue from %s',
    (branch) => {
      expect(issueNumberOf(branch)).toBeUndefined();
    },
  );
});

describe('issueTask', () => {
  it('is the title, the body and the issue reference', () => {
    expect(
      issueTask(
        issue({ number: 8, title: 'feat: issue list', body: '## Idea\r\n\r\nShow them.\n' }),
      ),
    ).toBe(
      [
        'feat: issue list',
        '',
        '## Idea\n\nShow them.',
        '',
        'Gitea issue #8: http://localhost:3000/smotastic/pocket-comms/issues/8',
        'Implement this issue. Write "Closes #8" in the pull request description.',
      ].join('\n'),
    );
  });

  it('leaves an empty body out', () => {
    expect(issueTask(issue({ number: 2, title: '  Short  ', body: '  \n ' }))).toBe(
      [
        'Short',
        '',
        'Gitea issue #2: http://localhost:3000/smotastic/pocket-comms/issues/2',
        'Implement this issue. Write "Closes #2" in the pull request description.',
      ].join('\n'),
    );
  });

  it('cuts a long body so the task fits', () => {
    const text = issueTask(issue({ number: 5, title: 'Long', body: 'word '.repeat(10_000) }));

    expect(text.length).toBeLessThanOrEqual(MAX_TASK_LENGTH);
    expect(text).toContain('[…] The issue is longer; read it in Gitea.');
    expect(text.endsWith('Write "Closes #5" in the pull request description.')).toBe(true);
  });
});

describe('workOnIssues', () => {
  it('names the worktrees of each issue and the live agents in them', () => {
    const work = workOnIssues(
      [
        { path: '/p/app', branch: 'master' },
        { path: '/w/app/feat-8-list', branch: 'feat/8-list' },
        { path: '/w/app/fix-8-again', branch: 'fix/8-again' },
        { path: '/w/app/feat-80-other', branch: 'feat/80-other' },
        { path: '/w/app/detached', branch: undefined },
      ],
      [
        agent('p1', '/w/app/feat-8-list'),
        agent('p2', '/w/app/feat-8-list/packages/web'),
        agent('p3', '/w/app/feat-8-list-old'),
        agent('p4', undefined),
        agent('p5', '/w/app/feat-80-other'),
      ],
    );

    expect(work.get(8)).toEqual([
      {
        branch: 'feat/8-list',
        agents: [agent('p1', '/w/app/feat-8-list'), agent('p2', '/w/app/feat-8-list/packages/web')],
      },
      { branch: 'fix/8-again', agents: [] },
    ]);
    expect(work.get(80)).toEqual([
      { branch: 'feat/80-other', agents: [agent('p5', '/w/app/feat-80-other')] },
    ]);
    expect([...work.keys()].sort()).toEqual([8, 80]);
  });
});
