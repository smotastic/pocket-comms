import { cleanup, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RequestError, type IssueListView, type IssueView } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const issue = (overrides: Partial<IssueView> & Pick<IssueView, 'number'>): IssueView => ({
  title: `Issue ${overrides.number}`,
  labels: [],
  updatedAt: Date.now() - 3_600_000,
  url: `http://gitea.test/smotastic/beta/issues/${overrides.number}`,
  branch: `feat/${overrides.number}-issue`,
  work: [],
  ...overrides,
});

const listed = (...issues: ReadonlyArray<IssueView>): IssueListView => ({
  _tag: 'Listed',
  repository: { owner: 'smotastic', name: 'beta', url: 'http://gitea.test/smotastic/beta' },
  issues,
});

const projects = [
  { name: 'alpha', open: true },
  { name: 'beta', open: false },
];

const waiting = fakeAgent({
  ref: 'uhura',
  name: 'uhura',
  paneId: 'w1:p1',
  project: 'alpha',
  status: 'blocked',
  needsYou: true,
});
const working = fakeAgent({ ref: 'kirk', paneId: 'w1:p2', project: 'alpha', status: 'working' });
const overview = {
  needsYou: [waiting],
  groups: [{ key: '/alpha/.git', name: 'alpha', agents: [working] }],
};

const betaIssues = listed(
  issue({ number: 8, title: 'feat: issue list', labels: ['enhancement', 'ui'] }),
  issue({
    number: 7,
    title: 'Login breaks',
    work: [
      {
        branch: 'fix/7-login',
        agents: [{ ref: 'beta-7', status: 'working' }],
      },
    ],
  }),
  issue({ number: 3, title: 'Dark mode' }),
);

const open = (extra: Parameters<typeof fakeClient>[0] = {}) => {
  const fake = fakeClient({
    overview,
    projects,
    issues: new Map([['beta', betaIssues]]),
    ...extra,
  });
  const rendered = renderApp({ client: fake.client });
  return { ...fake, ...rendered };
};

const openSheet = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Projects' }));
  return screen.getByRole('dialog', { name: 'Projects' });
};

const entry = (sheet: HTMLElement, project: string) =>
  within(sheet).getByRole('button', { name: new RegExp(`^${project} `, 'u') });

describe('the projects sheet', () => {
  it('opens from the top bar and lists every project with its agents and issues', async () => {
    open();
    const sheet = await openSheet();

    expect(await within(sheet).findByRole('button', { name: 'beta No agents · 3 issues' })).toBe(
      entry(sheet, 'beta'),
    );
    expect(entry(sheet, 'alpha').textContent).toContain('2 agents · 1 needs you');
    expect(entry(sheet, 'alpha').getAttribute('aria-expanded')).toBe('false');
    expect(entry(sheet, 'beta').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows no issue count for a project without a Gitea remote', async () => {
    open();
    const sheet = await openSheet();
    await within(sheet).findByRole('button', { name: /^beta .*3 issues/u });
    expect(entry(sheet, 'alpha').textContent).not.toContain('issue');
  });

  it('opens one project at a time, below its entry', async () => {
    open();
    const sheet = await openSheet();

    await userEvent.click(entry(sheet, 'beta'));
    const panel = await within(sheet).findByRole('region', { name: 'beta' });
    expect(
      within(panel)
        .getAllByRole('article')
        .map((card) => card.getAttribute('aria-labelledby') && card.textContent),
    ).toEqual([
      expect.stringMatching(/^#8 feat: issue list/u),
      expect.stringMatching(/^#7 Login breaks/u),
      expect.stringMatching(/^#3 Dark mode/u),
    ]);
    expect(within(panel).getByRole('button', { name: 'New task' })).toBeDefined();
    expect(within(panel).getByRole('link', { name: 'Project page' })).toBeDefined();

    await userEvent.click(entry(sheet, 'alpha'));
    expect(within(sheet).queryByRole('region', { name: 'beta' })).toBeNull();
    expect(within(sheet).getByRole('region', { name: 'alpha' })).toBeDefined();
    await userEvent.click(entry(sheet, 'alpha'));
    expect(within(sheet).queryByRole('region', { name: 'alpha' })).toBeNull();
  });

  it('shows an issue’s labels, or the agent on it instead of Implement', async () => {
    open();
    const sheet = await openSheet();
    await userEvent.click(entry(sheet, 'beta'));

    const eight = await within(sheet).findByRole('article', { name: '#8 feat: issue list' });
    expect(eight.textContent).toContain('enhancement · ui');
    expect(within(eight).getByRole('button', { name: 'Implement #8' })).toBeDefined();
    const seven = within(sheet).getByRole('article', { name: '#7 Login breaks' });
    expect(seven.textContent).toContain('beta-7 is on it');
    expect(within(seven).queryByRole('button', { name: 'Implement #7' })).toBeNull();
  });

  it('says what a project without issues shows', async () => {
    open({
      issues: new Map<string, IssueListView | RequestError>([
        ['alpha', { _tag: 'NotConfigured' }],
        ['beta', listed()],
      ]),
    });
    const sheet = await openSheet();

    await userEvent.click(entry(sheet, 'beta'));
    expect(await within(sheet).findByText('No open issues.')).toBeDefined();
    await userEvent.click(entry(sheet, 'alpha'));
    expect(await within(sheet).findByText(/Gitea is not configured/u)).toBeDefined();
  });

  it('says when a project has no Gitea remote or its issues cannot be read', async () => {
    open({
      issues: new Map<string, IssueListView | RequestError>([
        ['beta', new RequestError('Gitea cannot be reached.', 503)],
      ]),
    });
    const sheet = await openSheet();

    await userEvent.click(entry(sheet, 'alpha'));
    expect(await within(sheet).findByText(/has no Gitea remote/u)).toBeDefined();
    await userEvent.click(entry(sheet, 'beta'));
    expect(await within(sheet).findByText('Gitea cannot be reached.')).toBeDefined();
  });

  it('says why it lists no projects', async () => {
    const { client } = fakeClient({ overview, projects });
    renderApp({
      client: {
        ...client,
        projects: () => Promise.reject(new RequestError('The projects folder is gone.', 500)),
      },
    });
    const sheet = await openSheet();

    expect(await within(sheet).findByText('The projects folder is gone.')).toBeDefined();
  });

  it('closes with Escape, gives focus back to the Projects action and starts collapsed again', async () => {
    open();
    const sheet = await openSheet();
    await userEvent.click(entry(sheet, 'beta'));

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Projects' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Projects' }));
    const again = await openSheet();
    expect(entry(again, 'beta').getAttribute('aria-expanded')).toBe('false');
  });

  it("opens a project's page", async () => {
    const { router } = open();
    const sheet = await openSheet();
    await userEvent.click(entry(sheet, 'beta'));

    await userEvent.click(within(sheet).getByRole('link', { name: 'Project page' }));

    expect(router.state.location.pathname).toBe('/projects/beta');
    expect(screen.queryByRole('dialog', { name: 'Projects' })).toBeNull();
  });

  it('implements an issue, then closes the sheets and opens the new agent', async () => {
    const agent = fakeAgent({ ref: 'feat-8-issue', paneId: 'wK:p1', title: 'Issue list' });
    const { router, calls } = open({
      agents: new Map([[agent.ref, agent]]),
      implemented: {
        workspace: 'wK',
        branch: 'feat/8-issue',
        path: '/w',
        agent: { ref: 'feat-8-issue', started: true, prompted: true },
      },
    });
    const sheet = await openSheet();
    await userEvent.click(entry(sheet, 'beta'));

    await userEvent.click(await within(sheet).findByRole('button', { name: 'Implement #8' }));
    const implement = screen.getByRole('dialog', { name: 'Implement #8' });
    await userEvent.click(within(implement).getByRole('button', { name: 'Start Claude' }));

    expect(calls.implemented).toEqual([['beta', 8, 'feat/8-issue']]);
    await screen.findByRole('heading', { name: 'feat-8-issue' });
    expect(router.state.location.pathname).toBe('/agents/feat-8-issue');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('starts a new task in the project', async () => {
    const agent = fakeAgent({ ref: 'feat-x', paneId: 'wK:p1', title: 'X' });
    const { router, calls } = open({
      agents: new Map([[agent.ref, agent]]),
      created: {
        workspace: 'wK',
        branch: 'feat/x',
        path: '/w',
        agent: { ref: 'feat-x', started: true, prompted: true },
      },
    });
    const sheet = await openSheet();
    await userEvent.click(entry(sheet, 'beta'));

    await userEvent.click(within(sheet).getByRole('button', { name: 'New task' }));
    const task = screen.getByRole('dialog', { name: 'New task' });
    expect(task.textContent).toContain('beta');
    await userEvent.type(within(task).getByRole('textbox', { name: 'Task' }), 'X');
    await userEvent.click(within(task).getByRole('button', { name: 'Create' }));

    expect(calls.tasks.map((created) => created.project)).toEqual(['beta']);
    expect(router.state.location.pathname).toBe('/agents/feat-x');
  });

  it('shows on the project page what a start without an agent left to say', async () => {
    const { router } = open({
      created: { workspace: 'wK', branch: 'feat/x', path: '/w' },
    });
    const sheet = await openSheet();
    await userEvent.click(entry(sheet, 'beta'));
    await userEvent.click(within(sheet).getByRole('button', { name: 'New task' }));
    const task = screen.getByRole('dialog', { name: 'New task' });
    await userEvent.type(within(task).getByRole('textbox', { name: 'Task' }), 'X');
    await userEvent.click(within(task).getByRole('switch', { name: 'Start an agent' }));
    await userEvent.click(within(task).getByRole('button', { name: 'Create' }));

    expect((await screen.findByRole('status')).textContent).toContain(
      'feat/x is ready in a new worktree.',
    );
    expect(router.state.location.pathname).toBe('/projects/beta');
  });
});
