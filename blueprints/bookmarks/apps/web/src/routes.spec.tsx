import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeClient, renderApp } from './testing.js';

describe('the addresses', () => {
  afterEach(cleanup);

  it('shows the bookmarks at /', async () => {
    const { router } = renderApp({ client: fakeClient() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Bookmarks' })).toBeDefined();
    expect(router.state.location.pathname).toBe('/');
  });

  it('says an unknown address was not found', async () => {
    renderApp({ client: fakeClient(), path: '/nothing-here' });
    expect(await screen.findByText(/not found/i)).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Bookmarks' })).toBeNull();
  });
});
