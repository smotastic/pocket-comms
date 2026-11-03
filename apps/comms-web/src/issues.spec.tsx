import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RequestError, type IssueListView, type IssueView } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const issue = (overrides: Partial<IssueView> & Pick<IssueView, 'number'>): IssueView => ({
  title: `Issue ${overrides.number}`,
  labels: [],
  updatedAt: Date.now() - 2 * 3_600_000,
  url: `http://gitea.test/smotastic/pocket-comms/issues/${overrides.number}`,
  branch: `feat/${overrides.number}-issue`,
  work: [],
  inProgress: false,
  ...overrides,
});

const listed = (...issues: ReadonlyArray<IssueView>): IssueListView => ({
  _tag: 'Listed',
  repository: {
    owner: 'smotastic',
    name: 'pocket-comms',
    url: 'http://gitea.test/smotastic/pocket-comms',
  },
  issues,
});

const open = (list: IssueListView | RequestError, extra: Parameters<typeof fakeClient>[0] = {}) => {
  const fake = fakeClient({ issues: new Map([['pocket-comms', list]]), ...extra });
  const rendered = renderApp({ client: fake.client, path: '/projects/pocket-comms' });
  return { ...fake, ...rendered };
};

// An issue's row: the list item around its Gitea link.
const rowOf = async (number: number) => {
  const link = await screen.findByRole('link', { name: new RegExp(`^#${number} `, 'u') });
  const row = link.closest('li');
  if (!(row instanceof HTMLElement)) throw new Error(`#${number} has no row.`);
  return row;
};

describe('the project screen', () => {
  it('lists the open issues with their labels, age and Gitea link', async () => {
    open(
      listed(
        issue({ number: 8, title: 'feat: issue list', labels: ['enhancement', 'ui'] }),
        issue({ number: 3, title: 'Login breaks', updatedAt: Date.now() - 3 * 86_400_000 }),
      ),
    );

    await screen.findByRole('heading', { name: 'pocket-comms' });
    const list = await screen.findByRole('list', { name: 'Open issues' });
    expect(
      within(list)
        .getAllByRole('link', { name: /^#/u })
        .map((link) => link.textContent),
    ).toEqual(['#8 feat: issue list', '#3 Login breaks']);
    const first = await rowOf(8);
    const link = within(first).getByRole('link', { name: '#8 feat: issue list' });
    expect(link.getAttribute('href')).toBe('http://gitea.test/smotastic/pocket-comms/issues/8');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(within(first).getByText('enhancement')).toBeTruthy();
    expect(within(first).getByText('ui')).toBeTruthy();
    expect(within(first).getByText('Updated 2h ago')).toBeTruthy();
    expect(within(await rowOf(3)).getByText('Updated 3d ago')).toBeTruthy();
  });

  it('shows the agents working on an issue, and a worktree without one', async () => {
    open(
      listed(
        issue({
          number: 8,
          work: [
            {
              branch: 'feat/8-issue-list',
              agents: [{ ref: 'feat-8-issue-list', status: 'working' }],
            },
            { branch: 'fix/8-old', agents: [] },
          ],
        }),
      ),
    );

    const row = await rowOf(8);
    const agent = within(row).getByRole('link', { name: 'feat-8-issue-list' });
    expect(agent.getAttribute('href')).toBe('/agents/feat-8-issue-list');
    expect(within(row).getByText('is working on this')).toBeTruthy();
    expect(within(row).getByText('Working')).toBeTruthy();
    expect(within(row).getByText('fix/8-old · no agent running')).toBeTruthy();
  });

  it('shows the issues in progress apart, above the open ones, without their label', async () => {
    open(
      listed(
        issue({ number: 7, labels: ['status/in-progress', 'ui'], inProgress: true }),
        issue({ number: 6, work: [{ branch: 'feat/6-x', agents: [] }], inProgress: true }),
        issue({ number: 5 }),
      ),
    );

    await screen.findByRole('heading', { name: 'In progress 2' });
    expect(screen.getByRole('heading', { name: 'Open 1' })).toBeTruthy();
    const numbers = (name: string) =>
      within(screen.getByRole('list', { name }))
        .getAllByRole('link', { name: /^#/u })
        .map((link) => link.textContent?.split(' ')[0]);
    expect(numbers('Issues in progress')).toEqual(['#7', '#6']);
    expect(numbers('Open issues')).toEqual(['#5']);
    const seven = await rowOf(7);
    expect(within(seven).getByText('ui')).toBeTruthy();
    expect(within(seven).queryByText('status/in-progress')).toBeNull();
  });

  it('leaves out a group without issues', async () => {
    open(listed(issue({ number: 5 })));

    await screen.findByRole('heading', { name: 'Open 1' });
    expect(screen.queryByRole('heading', { name: /^In progress/u })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Issues in progress' })).toBeNull();
  });

  it.each([
    [{ _tag: 'NotConfigured' } as const, /COMMS_GITEA_TOKEN/u],
    [{ _tag: 'NoGiteaRemote' } as const, /no Gitea remote/u],
    [listed(), /No open issues/u],
    [new RequestError('Gitea refused the token (401).', 503), /Gitea refused the token \(401\)\./u],
  ])('says why there is no issue to show: %j', async (list, text) => {
    open(list);

    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Implement/u })).toBeNull();
  });
});

describe('Implement with Claude', () => {
  const startSheet = async (number: number) => {
    await userEvent.click(
      within(await rowOf(number)).getByRole('button', { name: 'Implement with Claude' }),
    );
    return screen.findByRole('dialog', { name: `Implement #${number}` });
  };

  it('starts Claude on the suggested branch and opens its conversation', async () => {
    const agent = fakeAgent({ ref: 'feat-8-issue-list', paneId: 'wK:p1' });
    const { calls, router } = open(
      listed(issue({ number: 8, title: 'feat: issue list', branch: 'feat/8-issue-list' })),
      {
        agents: new Map([[agent.ref, agent]]),
        implemented: {
          workspace: 'wK',
          branch: 'feat/8-issue-list',
          path: '/worktrees/feat-8-issue-list',
          agent: { ref: 'feat-8-issue-list', started: true, prompted: true },
        },
      },
    );

    const sheet = await startSheet(8);
    expect(within(sheet).getByText('feat: issue list')).toBeTruthy();
    const branch = within(sheet).getByRole('textbox', { name: 'Branch' }) as HTMLInputElement;
    expect(branch.value).toBe('feat/8-issue-list');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Start Claude' }));

    expect(calls.implemented).toEqual([['pocket-comms', 8, 'feat/8-issue-list']]);
    await screen.findByRole('heading', { name: 'feat-8-issue-list' });
    expect(router.state.location.pathname).toBe('/agents/feat-8-issue-list');
  });

  it('says when the started issue could not be marked in progress', async () => {
    const agent = fakeAgent({ ref: 'feat-8-issue', paneId: 'wK:p1' });
    open(listed(issue({ number: 8 })), {
      agents: new Map([[agent.ref, agent]]),
      implemented: {
        workspace: 'wK',
        branch: 'feat/8-issue',
        path: '/worktrees/feat-8-issue',
        agent: { ref: 'feat-8-issue', started: true, prompted: true },
        markNote: '#8 was not marked in progress: Gitea refused the token (403).',
      },
    });

    const sheet = await startSheet(8);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Start Claude' }));

    expect((await screen.findByRole('status')).textContent).toBe(
      '#8 was not marked in progress: Gitea refused the token (403).',
    );
  });

  it('sends the branch the owner typed', async () => {
    const { calls } = open(listed(issue({ number: 8, branch: 'feat/8-issue' })), {
      implemented: { workspace: 'wK', branch: 'fix/8-x', path: '/w' },
    });

    const sheet = await startSheet(8);
    const branch = within(sheet).getByRole('textbox', { name: 'Branch' });
    await userEvent.clear(branch);
    await userEvent.type(branch, 'fix/8-x');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Start Claude' }));

    expect(calls.implemented).toEqual([['pocket-comms', 8, 'fix/8-x']]);
    expect(await screen.findByText('fix/8-x is ready in a new worktree.')).toBeTruthy();
  });

  it('keeps the branch and shows why starting failed', async () => {
    open(listed(issue({ number: 8, branch: 'feat/8-issue' })), {
      implemented: new RequestError('The branch exists already', 409),
    });

    const sheet = await startSheet(8);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Start Claude' }));

    expect(await within(sheet).findByText('The branch exists already')).toBeTruthy();
    expect((within(sheet).getByRole('textbox', { name: 'Branch' }) as HTMLInputElement).value).toBe(
      'feat/8-issue',
    );
  });

  it('shows a branch the server refuses next to the field', async () => {
    open(listed(issue({ number: 8 })), {
      implemented: new RequestError('The request is invalid', 422, [
        { field: 'branch', message: 'Name the branch <type>/<kebab-description>.' },
      ]),
    });

    const sheet = await startSheet(8);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Start Claude' }));

    expect(
      await within(sheet).findByText('Name the branch <type>/<kebab-description>.'),
    ).toBeTruthy();
  });
});

describe('Close an issue', () => {
  const closeSheet = async (number: number) => {
    await userEvent.click(within(await rowOf(number)).getByRole('button', { name: 'Close' }));
    return screen.findByRole('dialog', { name: `Close #${number}` });
  };

  it('asks first, then closes the issue and takes it off the list', async () => {
    const { calls } = open(
      listed(issue({ number: 8, title: 'feat: issue list' }), issue({ number: 3 })),
    );

    const sheet = await closeSheet(8);
    expect(within(sheet).getByText('feat: issue list')).toBeTruthy();
    expect(calls.closed).toEqual([]);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close issue' }));

    expect(calls.closed).toEqual([['pocket-comms', 8]]);
    expect(await screen.findByText('#8 closed.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('link', { name: /^#8 /u })).toBeNull());
    expect(screen.queryByRole('dialog', { name: 'Close #8' })).toBeNull();
    expect(await rowOf(3)).toBeTruthy();
  });

  it('closes nothing when the owner cancels', async () => {
    const { calls } = open(listed(issue({ number: 8 })));

    const sheet = await closeSheet(8);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Close #8' })).toBeNull());
    expect(calls.closed).toEqual([]);
    expect(await rowOf(8)).toBeTruthy();
  });

  it('warns about the agents and worktrees that still work on the issue', async () => {
    open(
      listed(
        issue({
          number: 8,
          work: [
            {
              branch: 'feat/8-issue-list',
              agents: [{ ref: 'feat-8-issue-list', status: 'working' }],
            },
            { branch: 'fix/8-old', agents: [] },
          ],
        }),
      ),
    );

    const sheet = await closeSheet(8);

    expect(
      within(sheet).getByText(
        'Still worked on: feat-8-issue-list, fix/8-old. Closing leaves them running.',
      ),
    ).toBeTruthy();
  });

  it('shows why closing failed and keeps the issue', async () => {
    const { state } = open(listed(issue({ number: 8 })));
    state.closeFailure = new RequestError('Gitea refused the token (403).', 503);

    const sheet = await closeSheet(8);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close issue' }));

    expect(await within(sheet).findByText('Gitea refused the token (403).')).toBeTruthy();
    expect(await rowOf(8)).toBeTruthy();
  });
});
