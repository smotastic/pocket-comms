import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '@smotastic/pocket-design/testing';
import { RequestError } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const openSettings = (
  quickReplies: ReadonlyArray<string> = ['Go ahead', 'Commit and open a PR'],
) => {
  const fake = fakeClient({ quickReplies });
  return { ...fake, ...renderApp({ client: fake.client, path: '/settings' }) };
};

const list = () => screen.findByRole('list', { name: 'Quick replies' });
const shown = async () =>
  within(await list())
    .getAllByRole('listitem')
    // The move buttons show only an arrow; the other actions are icons.
    .map((item) => (item.textContent ?? '').replace(/[↑↓]/gu, '').trim());

describe('the Settings page', () => {
  it('opens from the overview', async () => {
    const fake = fakeClient();
    const { router } = renderApp({ client: fake.client });

    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
    expect(await list()).toBeDefined();
  });

  it("lists the owner's quick replies in their order", async () => {
    openSettings(['Go ahead', 'Run the tests first']);

    expect(await shown()).toEqual(['Go ahead', 'Run the tests first']);
  });

  it('adds a reply at the end and saves it at once', async () => {
    const fake = openSettings(['Go ahead']);
    const field = await screen.findByRole('textbox', { name: 'New quick reply' });

    await userEvent.type(field, 'Run the tests first{Enter}');

    await waitFor(() =>
      expect(fake.calls.savedQuickReplies).toEqual([['Go ahead', 'Run the tests first']]),
    );
    await waitFor(() => expect((field as HTMLInputElement).value).toBe(''));
    expect(await shown()).toEqual(['Go ahead', 'Run the tests first']);
  });

  it('moves a reply up and down', async () => {
    const fake = openSettings(['A', 'B', 'C']);
    await list();

    await userEvent.click(screen.getByRole('button', { name: 'Move C up' }));
    await waitFor(() => expect(fake.calls.savedQuickReplies).toEqual([['A', 'C', 'B']]));
    await userEvent.click(screen.getByRole('button', { name: 'Move A down' }));

    await waitFor(() => expect(fake.calls.savedQuickReplies.at(-1)).toEqual(['C', 'A', 'B']));
    expect(await shown()).toEqual(['C', 'A', 'B']);
    expect(screen.getByRole('button', { name: 'Move C up' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Move B down' }).hasAttribute('disabled')).toBe(true);
  });

  it('edits a reply in place', async () => {
    const fake = openSettings(['Go ahead', 'Ship it']);
    await list();

    await userEvent.click(screen.getByRole('button', { name: 'Edit Ship it' }));
    const field = screen.getByRole('textbox', { name: 'Edit the reply' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Ship it now{Enter}');

    await waitFor(() =>
      expect(fake.calls.savedQuickReplies).toEqual([['Go ahead', 'Ship it now']]),
    );
    expect(await shown()).toEqual(['Go ahead', 'Ship it now']);
  });

  it('deletes a reply', async () => {
    const fake = openSettings(['Go ahead', 'Ship it']);
    await list();

    await userEvent.click(screen.getByRole('button', { name: 'Delete Go ahead' }));

    await waitFor(() => expect(fake.calls.savedQuickReplies).toEqual([['Ship it']]));
    expect(await shown()).toEqual(['Ship it']);
  });

  it('says why a save failed and keeps the saved list and the new text', async () => {
    const fake = openSettings(['Go ahead']);
    fake.state.saveQuickRepliesFailure = new RequestError('The request is invalid.', 422, [
      { field: 'replies', message: 'Reply 2 is the same as reply 1.' },
    ]);
    const field = await screen.findByRole('textbox', { name: 'New quick reply' });

    await userEvent.type(field, 'Go ahead {Enter}');

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Reply 2 is the same as reply 1.',
    );
    expect(await shown()).toEqual(['Go ahead']);
    expect((field as HTMLInputElement).value).toBe('Go ahead ');
  });

  it('says when the list is empty and offers the new replies in a conversation', async () => {
    const fake = openSettings([]);
    expect(await screen.findByText('No quick replies yet.')).toBeDefined();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'New quick reply' }),
      'Run the tests first{Enter}',
    );
    await waitFor(() => expect(fake.calls.savedQuickReplies).toHaveLength(1));
    fake.state.agents.set('kirk', fakeAgent());
    cleanup();
    renderApp({ client: fake.client, path: '/agents/kirk' });

    const grid = await screen.findByRole('grid', { name: 'Quick replies' });
    expect(within(grid).getByRole('row', { name: 'Run the tests first' })).toBeDefined();
  });

  it('has no accessibility violations', async () => {
    openSettings();
    await list();

    expect(await axeViolations(document.body)).toEqual([]);
  });
});
