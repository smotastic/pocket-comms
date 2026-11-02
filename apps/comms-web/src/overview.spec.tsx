import { act, cleanup, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const blocked = fakeAgent({
  ref: 'picard',
  name: 'picard',
  paneId: 'w2:p1',
  kind: 'pi',
  format: 'pi',
  status: 'blocked',
  needsYou: true,
});
const done = fakeAgent({
  ref: 'data',
  name: 'data',
  paneId: 'w3:p1',
  status: 'done',
  needsYou: true,
  title: 'Mockup',
});
const working = fakeAgent({ ref: 'kirk', status: 'working', title: 'Fix the build' });
const other = fakeAgent({
  ref: 'w4:p1',
  paneId: 'w4:p1',
  name: undefined,
  kind: 'codex',
  format: undefined,
  title: 'codex',
  workspace: 'notes',
  project: undefined,
});

const overview = {
  needsYou: [blocked, done],
  groups: [
    { key: '/work/app/.git', name: 'app', agents: [working] },
    { key: 'other', name: 'Other', agents: [other] },
  ],
};

describe('the overview', () => {
  it('lists Needs you first, then every other agent by project', async () => {
    renderApp({ client: fakeClient({ overview }).client });

    const needsYou = await screen.findByRole('region', { name: 'Needs you' });
    expect(
      within(needsYou)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([expect.stringContaining('picard'), expect.stringContaining('data')]);
    expect(within(needsYou).getByText(blocked.title)).toBeDefined();
    const rest = screen.getByRole('region', { name: 'Everything else' });
    expect(
      within(rest)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/agents/kirk', '/agents/w4%3Ap1']);
  });

  it('shows the two groups and the idle projects, each with its count, and no project cards', async () => {
    renderApp({ client: fakeClient({ overview }).client });

    await screen.findByRole('region', { name: 'Projects' });
    expect(
      screen.getAllByRole('region').map((region) => region.getAttribute('aria-label')),
    ).toEqual(['Needs you', 'Everything else', 'Projects']);
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Needs you 2', 'Everything else 2', 'Projects 2']);
  });

  it('leaves out an empty group', async () => {
    renderApp({
      client: fakeClient({ overview: { needsYou: [], groups: overview.groups } }).client,
    });

    await screen.findByRole('region', { name: 'Everything else' });
    expect(screen.queryByRole('region', { name: 'Needs you' })).toBeNull();
  });

  it('names an agent without a Herdr name by its workspace, never by its pane id', async () => {
    renderApp({ client: fakeClient({ overview }).client });

    await screen.findByRole('link', { name: /notes/ });
    expect(screen.queryByText('w4:p1')).toBeNull();
  });

  it("shows each row's worktree and project", async () => {
    const linked = fakeAgent({
      ref: 'spock',
      paneId: 'w2:p2',
      name: 'spock',
      workspace: 'ingestor-mvp',
      project: 'pocket-home',
      worktree: 'ingestor-mvp',
    });
    const loose = fakeAgent({
      ref: 'burnham',
      paneId: 'w5:p1',
      name: 'burnham',
      workspace: 'G registry cleanup',
      project: undefined,
    });
    renderApp({
      client: fakeClient({
        overview: {
          needsYou: [
            {
              ...linked,
              ref: 'uhura',
              paneId: 'w2:p3',
              name: 'uhura',
              status: 'blocked',
              needsYou: true,
            },
          ],
          groups: [
            {
              key: '/work/home/.git',
              name: 'pocket-home',
              agents: [linked, fakeAgent({ project: 'pocket-home' })],
            },
            { key: 'other', name: 'Other', agents: [loose] },
          ],
        },
      }).client,
    });

    const needsYou = await screen.findByRole('region', { name: 'Needs you' });
    const uhura = within(needsYou).getByRole('link', { name: /uhura/ });
    expect(within(uhura).getByText('pocket-home')).toBeDefined();
    expect(within(uhura).getByText('· ingestor-mvp')).toBeDefined();
    const rest = screen.getByRole('region', { name: 'Everything else' });
    const spock = within(rest).getByRole('link', { name: /spock/ });
    expect(within(spock).getByText('pocket-home')).toBeDefined();
    expect(within(spock).getByText('· ingestor-mvp')).toBeDefined();
    const burnham = within(rest).getByRole('link', { name: /burnham/ });
    expect(within(burnham).getByText('G registry cleanup')).toBeDefined();
  });

  it('shows the status and the time since the last change', async () => {
    renderApp({ client: fakeClient({ overview }).client });

    const row = await screen.findByRole('link', { name: /kirk/ });
    expect(within(row).getByText('Working')).toBeDefined();
    expect(within(row).getByText(/1m/)).toBeDefined();
    expect(row.getAttribute('href')).toBe('/agents/kirk');
  });

  it('opens an agent', async () => {
    const { router } = renderApp({ client: fakeClient({ overview }).client });

    await userEvent.click(await screen.findByRole('link', { name: /kirk/ }));

    expect(router.state.location.pathname).toBe('/agents/kirk');
  });

  it('updates from the live stream', async () => {
    const fake = fakeClient({ overview });
    renderApp({ client: fake.client });
    await screen.findByRole('link', { name: /kirk/ });

    act(() =>
      fake.emitOverview({
        _tag: 'Available',
        overview: {
          needsYou: [],
          groups: [
            {
              key: 'k',
              name: 'app',
              agents: [fakeAgent({ ref: 'sisko', name: 'sisko', paneId: 'w9:p1' })],
            },
          ],
        },
      }),
    );

    expect(await screen.findByRole('link', { name: /sisko/ })).toBeDefined();
    expect(screen.queryByRole('link', { name: /kirk/ })).toBeNull();
  });

  it('says so while Herdr is not running', async () => {
    const fake = fakeClient({ overview });
    renderApp({ client: fake.client });
    await screen.findByRole('link', { name: /kirk/ });

    act(() => fake.emitOverview({ _tag: 'Unavailable', reason: 'connect ENOENT' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Herdr is not running');
  });

  it('says when no agent runs', async () => {
    renderApp({ client: fakeClient().client });

    expect(await screen.findByText('No agents are running.')).toBeDefined();
  });

  it('shows that the live connection is up', async () => {
    renderApp({ client: fakeClient({ overview }).client });

    expect(await screen.findByText('Mac mini · live')).toBeDefined();
  });
});

describe('the projects on the overview', () => {
  const projects = [
    { name: 'app', open: true },
    { name: 'pocket-home', open: false },
    { name: 'pocket-learning', open: false },
  ];

  it('has no filter, projects or new task action in the top bar', async () => {
    renderApp({ client: fakeClient({ overview, projects }).client });

    const banner = await screen.findByRole('banner');
    expect(within(banner).queryAllByRole('button')).toEqual([]);
  });

  it('lists the projects without agents last, each opening its page', async () => {
    const { router } = renderApp({ client: fakeClient({ overview, projects }).client });

    const list = await screen.findByRole('list', { name: 'Projects without agents' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['pocket-home', 'pocket-learning']);

    await userEvent.click(within(list).getByRole('link', { name: 'pocket-home' }));
    expect(router.state.location.pathname).toBe('/projects/pocket-home');
  });

  it('leaves out a project whose only agent is in Needs you', async () => {
    const waiting = fakeAgent({
      ref: 'w9:p1',
      paneId: 'w9:p1',
      project: 'pocket-home',
      status: 'blocked',
      needsYou: true,
    });
    renderApp({
      client: fakeClient({ overview: { needsYou: [waiting], groups: [] }, projects }).client,
    });

    const list = await screen.findByRole('list', { name: 'Projects without agents' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['app', 'pocket-learning']);
  });

  it('shows no projects list when every project has an agent', async () => {
    renderApp({ client: fakeClient({ overview, projects: [{ name: 'app', open: true }] }).client });

    await screen.findByRole('region', { name: 'Everything else' });
    expect(screen.queryByRole('region', { name: 'Projects' })).toBeNull();
  });

  it('leads the old projects address to the overview', async () => {
    const { router } = renderApp({ client: fakeClient({ overview }).client, path: '/projects' });

    await screen.findByRole('region', { name: 'Needs you' });
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('the project filter', () => {
  const comms = fakeAgent({ ref: 'kirk', project: 'pocket-comms', workspace: 'comms' });
  const home = fakeAgent({ ref: 'spock', name: 'spock', paneId: 'w2:p1', project: 'pocket-home' });
  const waiting = fakeAgent({
    ref: 'uhura',
    name: 'uhura',
    paneId: 'w3:p1',
    project: 'pocket-comms',
    status: 'blocked',
    needsYou: true,
  });
  const commsGroup = { key: '/comms/.git', name: 'pocket-comms', agents: [comms] };
  const homeGroup = { key: '/home/.git', name: 'pocket-home', agents: [home] };
  const twoProjects = {
    needsYou: [waiting],
    groups: [commsGroup, homeGroup],
  };

  it('offers All and each project, with All pressed', async () => {
    renderApp({ client: fakeClient({ overview: twoProjects }).client });

    const filter = await screen.findByRole('group', { name: 'Project' });
    expect(
      within(filter)
        .getAllByRole('button')
        .map((button) => [button.textContent, button.getAttribute('aria-pressed')]),
    ).toEqual([
      ['All', 'true'],
      ['pocket-comms', 'false'],
      ['pocket-home', 'false'],
    ]);
  });

  it('narrows Everything else to a project, and never Needs you', async () => {
    renderApp({ client: fakeClient({ overview: twoProjects }).client });

    await userEvent.click(await screen.findByRole('button', { name: 'pocket-home' }));

    const rest = screen.getByRole('region', { name: 'Everything else' });
    expect(
      within(rest)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([expect.stringContaining('spock')]);
    expect(within(rest).getByRole('heading').textContent).toBe('Everything else 1');
    expect(
      within(screen.getByRole('region', { name: 'Needs you' })).getByRole('link', {
        name: /uhura/,
      }),
    ).toBeDefined();
  });

  it('is not shown for agents of one project', async () => {
    renderApp({
      client: fakeClient({
        overview: {
          needsYou: [],
          groups: [commsGroup],
        },
      }).client,
    });

    await screen.findByRole('region', { name: 'Everything else' });
    expect(screen.queryByRole('group', { name: 'Project' })).toBeNull();
  });

  it('returns to All when the chosen project has no agent left', async () => {
    const fake = fakeClient({ overview: twoProjects });
    renderApp({ client: fake.client });
    await userEvent.click(await screen.findByRole('button', { name: 'pocket-home' }));

    act(() =>
      fake.emitOverview({
        _tag: 'Available',
        overview: {
          ...twoProjects,
          groups: [
            commsGroup,
            {
              key: 'other',
              name: 'Other',
              agents: [
                fakeAgent({ ref: 'w9:p1', paneId: 'w9:p1', name: 'scratch', project: undefined }),
              ],
            },
          ],
        },
      }),
    );

    expect((await screen.findByRole('button', { name: 'All' })).getAttribute('aria-pressed')).toBe(
      'true',
    );
    act(() => fake.emitOverview({ _tag: 'Available', overview: twoProjects }));
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
  });
});
