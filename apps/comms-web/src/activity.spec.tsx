import { act, cleanup, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { activityText } from './activity.js';
import type { ActivityEventView } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const kirk = {
  paneId: 'w1:p1',
  ref: 'kirk',
  name: 'kirk',
  workspace: 'feat-x',
  project: 'pocket-comms',
  worktree: 'feat-x',
};

const at = (minutesAgo: number) => Date.now() - minutesAgo * 60_000;

const finished: ActivityEventView = {
  id: 'e3',
  at: at(1),
  type: 'status',
  status: 'done',
  agent: kirk,
  live: true,
};
const prompted: ActivityEventView = {
  id: 'e2',
  at: at(4),
  type: 'prompt',
  excerpt: 'Fix the failing test',
  images: 2,
  agent: kirk,
  live: true,
};
const gone: ActivityEventView = {
  id: 'e1',
  at: at(90),
  type: 'gone',
  agent: { ...kirk, paneId: 'w2:p1', ref: 'spock', name: 'spock', worktree: undefined },
  live: false,
};
const goneElsewhere: ActivityEventView = {
  id: 'e0',
  at: at(120),
  type: 'gone',
  agent: {
    paneId: 'w3:p1',
    ref: 'w3:p1',
    name: undefined,
    workspace: 'notes',
    project: undefined,
    worktree: undefined,
  },
  live: false,
};

const events = [finished, prompted, gone, goneElsewhere];

const timeline = () => screen.findByRole('list', { name: 'Activity' });

describe('the activity page', () => {
  it('opens from the projects sheet of the overview', async () => {
    renderApp({ client: fakeClient({ activity: { events } }).client });

    await userEvent.click(await screen.findByRole('button', { name: 'Projects' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Projects' })).getByRole('link', {
        name: 'Activity',
      }),
    );

    expect(await screen.findByRole('heading', { name: 'Activity' })).toBeDefined();
    expect(await timeline()).toBeDefined();
  });

  it('lists every event newest first with its agent, project, text and time', async () => {
    renderApp({ client: fakeClient({ activity: { events } }).client, path: '/activity' });

    const items = within(await timeline()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/kirk.*· feat-x.*pocket-comms.*Finished.*1m/u),
      expect.stringMatching(/kirk.*pocket-comms.*You: Fix the failing test \(\+2 images\).*4m/u),
      expect.stringMatching(/spock.*pocket-comms.*Gone.*1h/u),
      expect.stringMatching(/notes.*notes.*Gone.*2h/u),
    ]);
  });

  it("opens a live agent's conversation", async () => {
    const fake = fakeClient({ activity: { events } });
    fake.state.agents.set('kirk', fakeAgent({ name: 'kirk', ref: 'kirk' }));
    const { router } = renderApp({ client: fake.client, path: '/activity' });

    const [first] = within(await timeline()).getAllByRole('link');
    expect(first?.getAttribute('href')).toBe('/agents/kirk');
    await userEvent.click(first as HTMLElement);

    expect(router.state.location.pathname).toBe('/agents/kirk');
  });

  it('opens the project of an agent that is gone, and nothing for one without a project', async () => {
    const { router } = renderApp({
      client: fakeClient({ activity: { events } }).client,
      path: '/activity',
    });

    const list = await timeline();
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/agents/kirk',
      '/agents/kirk',
      '/projects/pocket-comms',
    ]);
    expect(within(list).getAllByRole('listitem')[3]?.querySelector('a')).toBeNull();
    await userEvent.click(links[2] as HTMLElement);

    expect(router.state.location.pathname).toBe('/projects/pocket-comms');
  });

  it('says so when nothing happened', async () => {
    renderApp({ client: fakeClient().client, path: '/activity' });

    expect(await screen.findByText('Nothing happened in the last 24 hours.')).toBeDefined();
  });

  it('shows a new event as it arrives', async () => {
    const fake = fakeClient({ activity: { events: [prompted] } });
    renderApp({ client: fake.client, path: '/activity' });
    await timeline();

    act(() => fake.emitActivity({ events: [finished, prompted] }));

    expect(within(await timeline()).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Finished')).toBeDefined();
  });

  it('goes back to the overview', async () => {
    const { router } = renderApp({ client: fakeClient().client, path: '/activity' });

    await userEvent.click(await screen.findByRole('button', { name: 'Back to all agents' }));

    expect(router.state.location.pathname).toBe('/');
  });
});

describe('activityText', () => {
  const of = (event: Partial<ActivityEventView>) =>
    activityText({ ...finished, ...event } as ActivityEventView);

  it.each([
    [{ type: 'appeared' }, 'New agent'],
    [{ type: 'gone' }, 'Gone'],
    [{ type: 'status', status: 'working' }, 'Working'],
    [{ type: 'status', status: 'blocked' }, 'Needs you'],
    [{ type: 'status', status: 'done' }, 'Finished'],
    [{ type: 'prompt', excerpt: 'Go on', images: 0 }, 'You: Go on'],
    [{ type: 'prompt', excerpt: 'Look', images: 1 }, 'You: Look (+1 image)'],
    [{ type: 'prompt', excerpt: '', images: 2 }, 'You sent 2 images'],
    [{ type: 'keys', keys: ['enter'] }, 'You pressed Enter'],
    [{ type: 'typed', excerpt: 'Use SQLite' }, 'You typed: Use SQLite'],
    [{ type: 'keys', keys: ['2', 'down', 'esc', 'ctrl+c'] }, 'You pressed 2, ↓, Esc, Ctrl-C'],
    [{ type: 'keys', keys: ['left', 'right'] }, 'You pressed ←, →'],
    [{ type: 'keys', keys: ['pageup', 'pagedown'] }, 'You pressed Page up, Page down'],
  ] as const)('says %o as "%s"', (event, text) => {
    expect(of(event as Partial<ActivityEventView>)).toBe(text);
  });
});
