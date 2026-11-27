import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { MissionView } from './comms-client.js';
import { fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const mission = (overrides: Partial<MissionView> & Pick<MissionView, 'id'>): MissionView => ({
  planet: 'pocket-home',
  issue: { number: 7, title: 'Fix the header', url: 'http://gitea.test/7' },
  lane: 'hop',
  state: 'queued',
  sentAt: Date.now() - 3_600_000,
  ...overrides,
});

describe('Mission Control (spec 035)', () => {
  it('counts the new missions on the start screen and opens Mission Control', async () => {
    const { router } = renderApp({
      client: fakeClient({ missions: { queue: [], log: [], newCount: 3 } }).client,
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Mission Control, 3 new missions' }),
    );

    expect(router.state.location.pathname).toBe('/missions');
  });

  it('shows the running mission, the queue and the log, and marks the log seen', async () => {
    const now = Date.now();
    const fake = fakeClient({
      missions: {
        running: mission({ id: 'r', state: 'waiting', agent: 'fix-7-header' }),
        queue: [mission({ id: 'q', issue: { number: 8, title: 'Albums', url: 'http://g/8' } })],
        log: [
          mission({
            id: 'm',
            state: 'merged',
            isNew: true,
            issue: { number: 5, title: 'Search', url: 'http://g/5' },
            startedAt: now - 3_600_000,
            finishedAt: now - 60_000,
            pullRequest: { number: 12, url: 'http://g/pulls/12' },
            outcome: 'Added search and merged #12.',
          }),
        ],
        newCount: 1,
      },
    });
    renderApp({ client: fake.client, path: '/missions' });

    const running = await screen.findByRole('region', { name: 'Running mission' });
    expect(within(running).getByText('Waiting on you')).toBeTruthy();
    const log = screen.getByRole('list', { name: 'Mission log' });
    expect(within(log).getByText('New')).toBeTruthy();
    expect(within(log).getByText('Merged, not deployed')).toBeTruthy();
    expect(within(log).getByText('Added search and merged #12.')).toBeTruthy();
    expect(within(log).getByRole('link', { name: 'Pull request #12' })).toBeTruthy();
    await waitFor(() => expect(fake.calls.missionsSeen).toBe(1));

    await userEvent.click(within(running).getByRole('button', { name: 'Abort' }));
    const queue = screen.getByRole('list', { name: 'Mission queue' });
    await userEvent.click(within(queue).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(fake.calls.missionRequests).toEqual(['abort r', 'remove q']));
  });

  it('offers Resume for a lost mission', async () => {
    const fake = fakeClient({
      missions: { running: mission({ id: 'l', state: 'lost' }), queue: [], log: [], newCount: 0 },
    });
    renderApp({ client: fake.client, path: '/missions' });

    const running = await screen.findByRole('region', { name: 'Running mission' });
    await userEvent.click(within(running).getByRole('button', { name: 'Resume' }));

    await waitFor(() => expect(fake.calls.missionRequests).toEqual(['resume l']));
  });
});
