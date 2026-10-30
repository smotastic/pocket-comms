import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BookmarksClient } from './bookmarks-client.js';
import { fakeClient, renderApp } from './testing.js';

const effect = { url: 'https://effect.website', title: 'Effect', tags: ['docs'] };

describe('App', () => {
  afterEach(cleanup);

  it('lists the stored bookmarks', async () => {
    renderApp({ client: fakeClient([effect]) });
    expect(await screen.findByRole('link', { name: 'Effect' })).toHaveProperty(
      'href',
      'https://effect.website/',
    );
  });

  it('adds a bookmark with comma-separated tags', async () => {
    renderApp({ client: fakeClient() });
    fireEvent.change(await screen.findByLabelText('URL'), {
      target: { value: 'https://vite.dev' },
    });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Vite' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'build, web' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('link', { name: 'Vite' })).toBeDefined();
    expect(screen.getByText('build')).toBeDefined();
    expect(screen.getByText('web')).toBeDefined();
    expect(screen.getByLabelText('URL')).toHaveProperty('value', '');
  });

  it('shows the message of a failed request', async () => {
    renderApp({ client: fakeClient([effect]) });
    await screen.findByRole('link', { name: 'Effect' });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: effect.url } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Again' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toContain('already has the URL');
    expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Again');
  });

  it('shows the message of a list that failed to load', async () => {
    const client: BookmarksClient = {
      ...fakeClient(),
      list: () => Promise.reject(new Error('The server is down.')),
    };
    renderApp({ client });
    expect((await screen.findByRole('alert')).textContent).toContain('The server is down.');
  });

  it('clears the message once a later request succeeds', async () => {
    renderApp({ client: fakeClient([effect]) });
    await screen.findByRole('link', { name: 'Effect' });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: effect.url } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Again' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('removes an archived bookmark from the list', async () => {
    renderApp({ client: fakeClient([effect]) });
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Effect' })).toBeNull());
  });

  it('removes a deleted bookmark from the list', async () => {
    renderApp({ client: fakeClient([effect]) });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Effect' })).toBeNull());
  });
});
