import { act, cleanup, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RequestError, type OverviewView } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const blocked = fakeAgent({
  ref: 'w2:p1',
  paneId: 'w2:p1',
  name: 'spock',
  planet: 'pocket-home',
  worktree: 'feat-login',
  status: 'blocked',
  needsYou: true,
});
const working = fakeAgent({ ref: 'kirk', planet: 'pocket-home', status: 'working' });
const elsewhere = fakeAgent({ ref: 'w3:p1', paneId: 'w3:p1', name: 'uhura', planet: 'app' });

const overview: OverviewView = {
  needsYou: [blocked],
  groups: [
    { key: '/work/home/.git', name: 'pocket-home', agents: [working] },
    { key: '/work/app/.git', name: 'app', agents: [elsewhere] },
  ],
};

const agentsSection = () => screen.findByRole('region', { name: 'Agents' });

describe('the planet page', () => {
  it("lists the planet's agents, those that need the owner first", async () => {
    renderApp({ client: fakeClient({ overview }).client, path: '/planets/pocket-home' });

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
    renderApp({ client: fake.client, path: '/planets/pocket-home' });
    const section = await agentsSection();
    await within(section).findByText('spock');

    act(() =>
      fake.emitOverview({
        _tag: 'Available',
        multiplexer: 'herdr',
        overview: { needsYou: [], groups: [{ key: 'k', name: 'pocket-home', agents: [working] }] },
      }),
    );

    expect(within(section).queryByText('spock')).toBeNull();
  });

  it('says when no agent runs in the planet', async () => {
    renderApp({ client: fakeClient({ overview }).client, path: '/planets/pocket-comms' });

    expect(await within(await agentsSection()).findByText('No agents are running.')).toBeDefined();
    expect(await screen.findByRole('region', { name: 'Issues' })).toBeDefined();
  });

  it('goes back to the overview', async () => {
    const { router } = renderApp({ client: fakeClient().client, path: '/planets/pocket-home' });

    await userEvent.click(await screen.findByRole('button', { name: 'Back to all agents' }));

    expect(router.state.location.pathname).toBe('/');
  });

  it('says when the name is not a planet', async () => {
    renderApp({ client: fakeClient().client, path: '/planets/nope' });

    expect(await screen.findByText('nope is not a planet.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to all agents' })).toBeDefined();
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Brainstorm' }),
    ).toBeDefined();
  });

  it('opens the brainstorm from the top bar, right before New task', async () => {
    renderApp({ client: fakeClient().client, path: '/planets/pocket-home' });
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

describe("the planet page's preflight", () => {
  const noGo = {
    result: 'no-go' as const,
    checks: [
      { check: 'gitea' as const, passed: true, reason: "The repository is on the app's Gitea." },
      { check: 'agents-md' as const, passed: true, reason: 'master has an AGENTS.md.' },
      { check: 'ci-workflow' as const, passed: true, reason: 'master has a CI workflow.' },
      {
        check: 'ci-green' as const,
        passed: false,
        reason: 'The newest finished run on master ended as failure.',
      },
      {
        check: 'verify-script' as const,
        passed: true,
        reason: 'package.json on master has a verify script.',
      },
    ],
    autonomy: { chosen: 'manual' as const, effective: 'manual' as const },
    checkedAt: Date.now(),
  };

  const preflightCard = () => screen.findByRole('region', { name: 'Preflight' });

  it('shows the result, every check with its reason, and the autonomy levels', async () => {
    renderApp({
      client: fakeClient({ overview, preflights: new Map([['pocket-home', noGo]]) }).client,
      path: '/planets/pocket-home',
    });

    const card = await preflightCard();
    expect(await within(card).findByText('No-go')).toBeDefined();
    expect(within(card).getByText('CI green')).toBeDefined();
    expect(
      within(card).getByText('Failed: The newest finished run on master ended as failure.'),
    ).toBeDefined();
    expect(within(card).getByText('Passed: master has an AGENTS.md.')).toBeDefined();
    const levels = within(card).getByRole('radiogroup', { name: 'Autonomy level' });
    const manual = within(levels).getByRole('radio', { name: 'Manual' });
    expect(manual.getAttribute('aria-checked')).toBe('true');
    expect(within(levels).getByRole('radio', { name: 'Autopilot' })).toBeDefined();
    expect(within(card).getByText('In effect: manual.')).toBeDefined();
  });

  it('shows a check it does not know by its name, and keeps the rest of the card', async () => {
    const go = {
      result: 'go' as const,
      checks: [
        { check: 'gitea', passed: true, reason: "The repository is on the app's Gitea." },
        { check: 'warp-drive', passed: false, reason: 'The warp drive is cold.' },
      ],
      autonomy: { chosen: 'missions' as const, effective: 'missions' as const },
      checkedAt: Date.now(),
    };
    renderApp({
      client: fakeClient({ overview, preflights: new Map([['pocket-home', go]]) }).client,
      path: '/planets/pocket-home',
    });

    const card = await preflightCard();
    expect(await within(card).findByText('Go')).toBeDefined();
    expect(within(card).getByText('Gitea')).toBeDefined();
    expect(within(card).getByText('warp-drive')).toBeDefined();
    expect(within(card).getByText('Failed: The warp drive is cold.')).toBeDefined();
    expect(within(card).getByText('In effect: missions.')).toBeDefined();
    expect(within(card).getByRole('button', { name: 'Unregister' })).toBeDefined();
  });

  it('chooses the missions level (spec 035)', async () => {
    const fake = fakeClient({ overview, preflights: new Map([['pocket-home', noGo]]) });
    renderApp({ client: fake.client, path: '/planets/pocket-home' });
    const card = await preflightCard();

    await userEvent.click(await within(card).findByRole('radio', { name: 'Missions' }));

    expect(fake.calls.chosenLevels).toEqual(['pocket-home missions']);
  });

  it('chooses autopilot, and says when it is at missions because it does not deploy (spec 038)', async () => {
    const atMissions = {
      result: 'go' as const,
      checks: [{ check: 'gitea', passed: true, reason: "The repository is on the app's Gitea." }],
      autonomy: { chosen: 'autopilot' as const, effective: 'missions' as const },
      checkedAt: Date.now(),
    };
    const fake = fakeClient({ overview, preflights: new Map([['pocket-home', noGo]]) });
    renderApp({ client: fake.client, path: '/planets/pocket-home' });
    const card = await preflightCard();

    await userEvent.click(await within(card).findByRole('radio', { name: 'Autopilot' }));
    expect(fake.calls.chosenLevels).toEqual(['pocket-home autopilot']);

    fake.state.preflights.set('pocket-home', atMissions);
    renderApp({ client: fake.client, path: '/planets/pocket-home' });
    expect(
      await screen.findByText(
        'In effect: missions, lowered from autopilot because the planet does not deploy.',
      ),
    ).toBeDefined();
  });

  it('unregisters the planet only once the owner confirms, then goes back', async () => {
    const fake = fakeClient({ overview, preflights: new Map([['pocket-home', noGo]]) });
    renderApp({ client: fake.client, path: '/planets/pocket-home' });
    const card = await preflightCard();

    await userEvent.click(within(card).getByRole('button', { name: 'Unregister' }));
    expect(fake.calls.unregistered).toEqual([]);
    expect(
      within(card).getByText('Unregister pocket-home? Its agents keep running, under Other.'),
    ).toBeDefined();
    await userEvent.click(within(card).getByRole('button', { name: 'Keep it' }));
    expect(within(card).getByRole('button', { name: 'Unregister' })).toBeDefined();

    await userEvent.click(within(card).getByRole('button', { name: 'Unregister' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Unregister pocket-home' }));

    expect(fake.calls.unregistered).toEqual(['pocket-home']);
    expect(await screen.findByRole('button', { name: 'Planets' })).toBeDefined();
  });

  it('says why the preflight cannot be shown', async () => {
    renderApp({
      client: fakeClient({
        overview,
        preflights: new Map([['pocket-home', new RequestError('Gitea is away.', 503)]]),
      }).client,
      path: '/planets/pocket-home',
    });

    const card = await preflightCard();
    expect(await within(card).findByText('Gitea is away.')).toBeDefined();
  });

  it('shows the deploy checks and whether the planet deploys (spec 036)', async () => {
    renderApp({
      client: fakeClient({
        overview,
        preflights: new Map([
          [
            'pocket-home',
            {
              ...noGo,
              deploy: {
                deploys: false,
                checks: [
                  {
                    check: 'release-settings',
                    passed: false,
                    reason: 'AGENTS.md has no `json mission-control` block.',
                  },
                ],
              },
            },
          ],
        ]),
      }).client,
      path: '/planets/pocket-home',
    });

    const card = await preflightCard();
    expect(await within(card).findByText('Does not deploy: its missions end merged')).toBeDefined();
    expect(within(card).getByText('Releases')).toBeDefined();
    expect(
      within(card).getByText('Failed: AGENTS.md has no `json mission-control` block.'),
    ).toBeDefined();
  });

  it('resumes a paused planet, and allows or disallows its apps (spec 037)', async () => {
    const fake = fakeClient({
      overview,
      preflights: new Map([
        [
          'pocket-home',
          {
            ...noGo,
            checks: [
              ...noGo.checks,
              {
                check: 'last-deploy',
                passed: false,
                reason:
                  'The last deploy (home-v0.2.0) is down; resume the planet once it is fixed.',
              },
            ],
            deploy: {
              deploys: false,
              checks: [],
              apps: [
                { app: 'pocket-home-server', allowed: true },
                { app: 'pocket-home-web', allowed: false },
              ],
            },
          },
        ],
      ]),
    });
    renderApp({ client: fake.client, path: '/planets/pocket-home' });
    const card = await preflightCard();

    expect(await within(card).findByText('pocket-home-web: not allowed')).toBeDefined();
    await userEvent.click(within(card).getByRole('button', { name: 'Allow pocket-home-web' }));
    await userEvent.click(
      within(card).getByRole('button', { name: 'Disallow pocket-home-server' }),
    );
    await userEvent.click(within(card).getByRole('button', { name: 'Resume' }));

    expect(fake.calls.missionRequests).toEqual([
      'allow pocket-home pocket-home-server,pocket-home-web',
      'allow pocket-home ',
      'resume planet pocket-home',
    ]);
  });
});
