import { act, cleanup, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { OverviewView } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const blocked = fakeAgent({
  ref: 'w2:p1',
  paneId: 'w2:p1',
  name: 'spock',
  project: 'pocket-home',
  worktree: 'feat-login',
  status: 'blocked',
  needsYou: true,
});
const working = fakeAgent({ ref: 'kirk', project: 'pocket-home', status: 'working' });
const elsewhere = fakeAgent({ ref: 'w3:p1', paneId: 'w3:p1', name: 'uhura', project: 'app' });

const overview: OverviewView = {
  needsYou: [blocked],
  groups: [
    { key: '/work/home/.git', name: 'pocket-home', agents: [working] },
    { key: '/work/app/.git', name: 'app', agents: [elsewhere] },
  ],
};

const agentsSection = () => screen.findByRole('region', { name: 'Agents' });

describe('the project page', () => {
  it("lists the project's agents, those that need the owner first", async () => {
    renderApp({ client: fakeClient({ overview }).client, path: '/projects/pocket-home' });

    const section = await agentsSection();
    const rows = await within(section).findAllByRole('link', { name: /spock|kirk/u });
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      '/agents/w2%3Ap1',
      '/agents/kirk',
    ]);
    expect(within(section).getByText('· feat-login')).toBeDefined();
    expect(within(section).queryByText('uhura')).toBeNull();
    expect(within(section).queryByText('pocket-home')).toBeNull();
  });

  it('updates its agents live', async () => {
    const fake = fakeClient({ overview });
    renderApp({ client: fake.client, path: '/projects/pocket-home' });
    const section = await agentsSection();
    await within(section).findByText('spock');

    act(() =>
      fake.emitOverview({
        _tag: 'Available',
        overview: { needsYou: [], groups: [{ key: 'k', name: 'pocket-home', agents: [working] }] },
      }),
    );

    expect(within(section).queryByText('spock')).toBeNull();
  });

  it('says when no agent runs in the project', async () => {
    renderApp({ client: fakeClient({ overview }).client, path: '/projects/pocket-comms' });

    expect(await within(await agentsSection()).findByText('No agents are running.')).toBeDefined();
    expect(await screen.findByRole('region', { name: 'Issues' })).toBeDefined();
  });

  it('goes back to the overview', async () => {
    const { router } = renderApp({ client: fakeClient().client, path: '/projects/pocket-home' });

    await userEvent.click(await screen.findByRole('button', { name: 'Back to all agents' }));

    expect(router.state.location.pathname).toBe('/');
  });

  it('says when the name is not a project', async () => {
    renderApp({ client: fakeClient().client, path: '/projects/nope' });

    expect(await screen.findByText('nope is not a project.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to all agents' })).toBeDefined();
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Brainstorm' }),
    ).toBeDefined();
  });

  it('opens the brainstorm chat from the top bar, right before New task', async () => {
    renderApp({ client: fakeClient().client, path: '/projects/pocket-home' });
    const banner = await screen.findByRole('banner');

    expect(within(banner).getAllByRole('button')).toEqual([
      within(banner).getByRole('button', { name: 'Back to all agents' }),
      within(banner).getByRole('button', { name: 'Brainstorm' }),
      within(banner).getByRole('button', { name: 'New task' }),
    ]);

    await userEvent.click(within(banner).getByRole('button', { name: 'Brainstorm' }));

    expect(await screen.findByRole('dialog', { name: 'Brainstorm' })).toBeDefined();
  });
});
