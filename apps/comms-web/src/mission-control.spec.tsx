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

  it('shows the deploy states, versions and the fix issue, and offers Deploy (spec 036)', async () => {
    const fake = fakeClient({
      missions: {
        running: mission({ id: 'd', state: 'deploying', versions: undefined }),
        queue: [],
        log: [
          mission({
            id: 'w',
            state: 'awaiting-deploy',
            finishedAt: Date.now(),
            reason: 'home-server-v0.10.0 holds a database migration.',
          }),
          mission({
            id: 'r',
            state: 'rolled-back',
            finishedAt: Date.now(),
            versions: ['home-server-v0.9.1'],
            fixIssue: 42,
            output: 'health check failed: 503',
          }),
        ],
        newCount: 0,
      },
    });
    renderApp({ client: fake.client, path: '/missions' });

    const running = await screen.findByRole('region', { name: 'Running mission' });
    expect(within(running).getByText('Deploying')).toBeDefined();
    expect(within(running).queryByRole('button', { name: 'Abort' })).toBeNull();

    const log = screen.getByRole('list', { name: 'Mission log' });
    expect(within(log).getByText('Merged, waiting for you to deploy')).toBeDefined();
    expect(within(log).getByText('Rolled back')).toBeDefined();
    expect(within(log).getByText('home-server-v0.9.1')).toBeDefined();
    expect(
      within(log).getByText('Fix issue #42; the planet is paused until it is closed.'),
    ).toBeDefined();
    await userEvent.click(within(log).getByRole('button', { name: 'Deploy' }));
    await waitFor(() => expect(fake.calls.missionRequests).toEqual(['deploy w']));
  });

  it('shows how each release of a mission with several releases ended (issue 144)', async () => {
    const fake = fakeClient({
      missions: {
        queue: [],
        log: [
          mission({
            id: 'r',
            state: 'rolled-back',
            finishedAt: Date.now(),
            versions: ['app-v0.3.1', 'web-v0.1.1'],
            releases: [
              { tag: 'app-v0.3.1', outcome: 'deployed' },
              { tag: 'web-v0.1.1', outcome: 'rolled-back' },
            ],
          }),
          mission({
            id: 'd',
            state: 'deployed',
            finishedAt: Date.now(),
            versions: ['app-v0.3.0', 'web-v0.1.0'],
            releases: [
              { tag: 'app-v0.3.0', outcome: 'deployed' },
              { tag: 'web-v0.1.0', outcome: 'deployed' },
            ],
          }),
        ],
        newCount: 0,
      },
    });
    renderApp({ client: fake.client, path: '/missions' });

    const log = await screen.findByRole('list', { name: 'Mission log' });
    expect(within(log).getByText('app-v0.3.1 deployed, web-v0.1.1 rolled back')).toBeDefined();
    expect(within(log).getByText('app-v0.3.0, web-v0.1.0')).toBeDefined();
  });
});

describe('Autopilot in Mission Control (spec 038)', () => {
  const night = {
    window: '2026-11-27',
    triaged: true,
    triage: [
      {
        planet: 'pocket-lens',
        verdicts: [
          {
            number: 40,
            title: 'Albums of albums',
            url: 'http://gitea.test/40',
            verdict: 'full-flight' as const,
            reason: 'A new screen.',
          },
          {
            number: 41,
            title: 'Wrong plural',
            url: 'http://gitea.test/41',
            verdict: 'hop' as const,
            reason: 'One string.',
          },
        ],
      },
      { planet: 'pocket-coach', verdicts: [], skipped: 'Pi is not set up.' },
    ],
    sent: [
      {
        id: 'a1',
        planet: 'pocket-lens',
        issue: { number: 41, title: 'Wrong plural', url: 'http://gitea.test/41' },
        state: 'deployed' as const,
      },
    ],
    stopped: 'two missions in a row failed.',
  };

  it('shows the window, the planets, the triage and what it sent, and marks its missions', async () => {
    const fake = fakeClient({
      missions: {
        queue: [],
        log: [mission({ id: 'a1', state: 'deployed', autopilot: true, finishedAt: Date.now() })],
        newCount: 0,
      },
      autopilot: {
        settings: { enabled: true, start: '23:00', end: '07:00', budget: 5 },
        open: false,
        planets: ['pocket-lens'],
        night,
      },
    });
    renderApp({ client: fake.client, path: '/missions' });

    const section = await screen.findByRole('region', { name: 'Autopilot' });
    expect(
      await within(section).findByText(
        'Window 23:00–07:00, closed now. At autopilot: pocket-lens.',
      ),
    ).toBeDefined();
    expect(within(section).getByText('Stopped: two missions in a row failed.')).toBeDefined();
    expect(
      within(section).getByText('Triage of pocket-coach skipped: Pi is not set up.'),
    ).toBeDefined();
    const grilling = within(section).getByRole('list', { name: 'Ready for your grilling' });
    expect(within(grilling).getByText('pocket-lens #40 Albums of albums')).toBeDefined();
    expect(within(grilling).getByText('A new screen.')).toBeDefined();
    const sent = within(section).getByRole('list', { name: 'Sent by Autopilot' });
    expect(within(sent).getByText('Deployed')).toBeDefined();
    const log = screen.getByRole('list', { name: 'Mission log' });
    expect(within(log).getByText('Autopilot')).toBeDefined();
  });

  it('switches Autopilot off at once, and saves the window and budget', async () => {
    const fake = fakeClient();
    renderApp({ client: fake.client, path: '/missions' });
    const section = await screen.findByRole('region', { name: 'Autopilot' });

    await userEvent.click(await within(section).findByRole('switch', { name: /Autopilot/u }));
    await waitFor(() =>
      expect(fake.calls.autopilotSettings).toEqual([
        { enabled: false, start: '23:00', end: '07:00', budget: 5 },
      ]),
    );

    // Time fields, so a phone offers a time picker rather than a number pad without a colon.
    const opens = within(section).getByLabelText('Window opens');
    expect(opens.getAttribute('type')).toBe('time');
    expect(within(section).getByLabelText('Window closes').getAttribute('type')).toBe('time');
    await userEvent.clear(opens);
    await userEvent.type(opens, '22:30');
    await userEvent.click(within(section).getByRole('button', { name: 'Save window and budget' }));

    await waitFor(() =>
      expect(fake.calls.autopilotSettings.at(-1)).toEqual({
        enabled: false,
        start: '22:30',
        end: '07:00',
        budget: 5,
      }),
    );
  });
});
