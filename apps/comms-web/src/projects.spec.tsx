import { cleanup, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

describe('the Projects screen', () => {
  it('opens from the overview and lists the projects as the server orders them', async () => {
    const { router } = renderApp({ client: fakeClient().client });

    await userEvent.click(await screen.findByRole('button', { name: 'Projects' }));

    await screen.findByRole('heading', { name: 'Projects' });
    expect(router.state.location.pathname).toBe('/projects');
    const links = within(await screen.findByRole('list', { name: 'Projects' })).getAllByRole(
      'link',
    );
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['pocket-comms', '/projects/pocket-comms'],
      ['pocket-home', '/projects/pocket-home'],
    ]);
    expect(screen.getByText('Open in Herdr')).toBeTruthy();
  });

  it('opens a project and goes back to the overview', async () => {
    const { router } = renderApp({ client: fakeClient().client, path: '/projects' });

    await userEvent.click(await screen.findByRole('link', { name: 'pocket-home' }));
    expect(router.state.location.pathname).toBe('/projects/pocket-home');

    await userEvent.click(await screen.findByRole('button', { name: 'Back to the projects' }));
    expect(router.state.location.pathname).toBe('/projects');
    await userEvent.click(await screen.findByRole('button', { name: 'Back to all agents' }));
    expect(router.state.location.pathname).toBe('/');
  });
});
