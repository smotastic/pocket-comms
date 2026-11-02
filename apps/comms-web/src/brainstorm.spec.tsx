import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RequestError, type BrainstormStateView } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const ready = (overrides: Partial<Extract<BrainstormStateView, { _tag: 'Ready' }>> = {}) =>
  ({ _tag: 'Ready', entries: [], answering: false, live: '', ...overrides }) as const;

const proposal = {
  type: 'proposal',
  id: 'p1',
  at: 3,
  project: 'pocket-home',
  title: 'Dark mode',
  body: 'A toggle.',
  state: { _tag: 'open' },
} as const;

const openChat = async (brainstorm: BrainstormStateView = ready(), path = '/') => {
  const fake = fakeClient({ brainstorm });
  renderApp({ client: fake.client, path });
  await userEvent.click(await screen.findByRole('button', { name: 'Brainstorm' }));
  const sheet = await screen.findByRole('dialog', { name: 'Brainstorm' });
  return { ...fake, sheet };
};

describe('the brainstorm bubble', () => {
  it('shows on the overview, a conversation and a project page', async () => {
    const agent = fakeAgent();
    for (const path of ['/', `/agents/${agent.ref}`, '/projects/pocket-comms']) {
      const fake = fakeClient({ agents: new Map([[agent.ref, agent]]) });
      renderApp({ client: fake.client, path });
      expect(await screen.findByRole('button', { name: 'Brainstorm' })).toBeDefined();
      cleanup();
    }
  });

  it('opens the chat ready to type, and closing returns to the screen', async () => {
    const { sheet } = await openChat();

    expect(within(sheet).getByRole('textbox', { name: 'Message' })).toBeDefined();
    expect(within(sheet).getByText(/Note an idea in a few words/u)).toBeDefined();

    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog', { name: 'Brainstorm' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Brainstorm' })).toBeDefined();
  });
});

describe('the brainstorm chat', () => {
  it('sends a message and shows Pi’s answer as it streams in', async () => {
    const { sheet, calls, emitBrainstorm } = await openChat();

    await userEvent.type(
      within(sheet).getByRole('textbox', { name: 'Message' }),
      'Idea: dark mode',
    );
    await userEvent.click(within(sheet).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(calls.brainstormMessages).toEqual(['Idea: dark mode']));

    act(() =>
      emitBrainstorm({
        type: 'state',
        state: ready({
          entries: [{ type: 'user', id: 'u1', at: 1, text: 'Idea: dark mode' }],
          answering: true,
        }),
      }),
    );
    expect(await within(sheet).findByText('Idea: dark mode')).toBeDefined();
    expect(within(sheet).getByRole('status').textContent).toContain('Pi is thinking…');
    expect(within(sheet).getByRole('textbox', { name: 'Message' })).toHaveProperty(
      'disabled',
      true,
    );

    act(() => emitBrainstorm({ type: 'delta', text: 'Which ' }));
    act(() => emitBrainstorm({ type: 'delta', text: 'screens?' }));
    expect(await within(sheet).findByText('Which screens?')).toBeDefined();
  });

  it('shows why a message was refused', async () => {
    const { sheet, state } = await openChat();
    state.brainstormFailure = new RequestError('Pi is still answering.', 409);

    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Message' }), 'Again');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Send' }));

    expect((await within(sheet).findByRole('alert')).textContent).toBe('Pi is still answering.');
  });

  it('shows the answers, and why a turn failed', async () => {
    const { sheet } = await openChat(
      ready({
        entries: [
          { type: 'user', id: 'u1', at: 1, text: 'Idea' },
          { type: 'assistant', id: 'a1', at: 2, text: 'A **good** one.' },
          { type: 'failed', id: 'f1', at: 3, reason: 'The model cannot be reached.' },
        ],
      }),
    );

    expect(await within(sheet).findByText('good')).toBeDefined();
    expect(within(sheet).getByText(/The model cannot be reached\./u)).toBeDefined();
  });

  it('says that it is not set up and takes no message', async () => {
    const { sheet } = await openChat({
      _tag: 'NotSetUp',
      reason:
        'Set COMMS_BRAINSTORM_PROVIDER and COMMS_BRAINSTORM_MODEL to use the brainstorm chat.',
    });

    expect(await within(sheet).findByText('The brainstorm chat is not set up.')).toBeDefined();
    expect(within(sheet).getByText(/COMMS_BRAINSTORM_MODEL/u)).toBeDefined();
    expect(within(sheet).getByRole('textbox', { name: 'Message' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(within(sheet).queryByRole('button', { name: 'New chat' })).toBeNull();
  });

  it('starts a new chat only after a confirmation', async () => {
    const { sheet, calls } = await openChat(
      ready({ entries: [{ type: 'user', id: 'u1', at: 1, text: 'Idea' }] }),
    );

    await userEvent.click(await within(sheet).findByRole('button', { name: 'New chat' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Keep this chat' }));
    expect(calls.brainstormResets).toBe(0);

    await userEvent.click(within(sheet).getByRole('button', { name: 'New chat' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Start a new chat' }));
    await waitFor(() => expect(calls.brainstormResets).toBe(1));
    expect(within(sheet).queryByRole('button', { name: 'Start a new chat' })).toBeNull();
  });
});

describe('a proposal in the brainstorm chat', () => {
  it('creates the issue as the owner edited it', async () => {
    const { sheet, calls } = await openChat(ready({ entries: [proposal] }));
    const card = await within(sheet).findByRole('region', { name: 'Proposed issue: Dark mode' });

    await userEvent.selectOptions(
      within(card).getByRole('combobox', { name: 'Project' }),
      'pocket-comms',
    );
    const title = within(card).getByRole('textbox', { name: 'Title' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Dark mode toggle');
    await userEvent.click(within(card).getByRole('button', { name: 'Create issue' }));

    await waitFor(() =>
      expect(calls.decisions).toEqual([
        [
          'p1',
          {
            _tag: 'Create',
            draft: { project: 'pocket-comms', title: 'Dark mode toggle', body: 'A toggle.' },
          },
        ],
      ]),
    );
  });

  it('discards it, and shows why Gitea refused an issue', async () => {
    const { sheet, calls, state } = await openChat(ready({ entries: [proposal] }));
    const card = await within(sheet).findByRole('region', { name: 'Proposed issue: Dark mode' });

    state.brainstormFailure = new RequestError('Gitea refused the token (403).', 503);
    await userEvent.click(within(card).getByRole('button', { name: 'Create issue' }));
    expect((await within(card).findByRole('alert')).textContent).toBe(
      'Gitea refused the token (403).',
    );

    await userEvent.click(within(card).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(calls.decisions).toEqual([['p1', { _tag: 'Discard' }]]));
  });

  it('links a created issue and offers no more actions', async () => {
    const { sheet } = await openChat(
      ready({
        entries: [
          {
            ...proposal,
            state: { _tag: 'created', number: 12, url: 'http://gitea/i/12' },
          },
        ],
      }),
    );

    expect(
      (await within(sheet).findByRole('link', { name: 'Issue #12' })).getAttribute('href'),
    ).toBe('http://gitea/i/12');
    expect(within(sheet).queryByRole('button', { name: 'Create issue' })).toBeNull();
  });
});
