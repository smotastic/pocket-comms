import { act, cleanup, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const blocked = fakeAgent({
  ref: 'picard',
  paneId: 'w2:p1',
  kind: 'pi',
  format: 'pi',
  status: 'blocked',
  needsYou: true,
});
const done = fakeAgent({
  ref: 'data',
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
});

const overview = {
  needsYou: [blocked, done],
  groups: [
    { key: '/work/app/.git', name: 'app', agents: [working] },
    { key: 'ws:w4', name: 'notes', agents: [other] },
  ],
};

describe('the overview', () => {
  it('lists Needs you first, then the agents by repository', async () => {
    renderApp({ client: fakeClient({ overview }).client });

    const needsYou = await screen.findByRole('region', { name: 'Needs you' });
    expect(
      within(needsYou)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([expect.stringContaining('picard'), expect.stringContaining('data')]);
    expect(within(needsYou).getByText(/Needs your answer/)).toBeDefined();
    expect(
      within(screen.getByRole('region', { name: 'app' })).getByText(/Fix the build/),
    ).toBeDefined();
    expect(within(screen.getByRole('region', { name: 'notes' })).getByText('w4:p1')).toBeDefined();
  });

  it('shows the kind, the status and the time since the last change', async () => {
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
            { key: 'k', name: 'app', agents: [fakeAgent({ ref: 'sisko', paneId: 'w9:p1' })] },
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
