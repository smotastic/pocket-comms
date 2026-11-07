import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RequestError, type BrainstormStateView } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const ready = (overrides: Partial<Extract<BrainstormStateView, { _tag: 'Ready' }>> = {}) =>
  ({
    _tag: 'Ready',
    entries: [],
    answering: false,
    live: '',
    seesPictures: true,
    pictures: [],
    ...overrides,
  }) as const;

const proposal = {
  type: 'proposal',
  kind: 'issue',
  id: 'p1',
  at: 3,
  project: 'pocket-home',
  title: 'Dark mode',
  body: 'A toggle.',
  pictures: [],
  attached: [],
  state: { _tag: 'open' },
} as const;

const edit = {
  type: 'proposal',
  kind: 'edit',
  id: 'e1',
  at: 4,
  project: 'pocket-comms',
  number: 11,
  url: 'http://gitea/i/11',
  title: 'Orchestrator mode',
  body: 'Control agents from the chat.',
  base: { title: 'Orchestrator', body: 'An orchestrator agent.' },
  pictures: [],
  attached: [],
  state: { _tag: 'open' },
} as const;

const openChat = async (brainstorm: BrainstormStateView = ready(), path = '/') => {
  const fake = fakeClient({ brainstorm });
  renderApp({ client: fake.client, path });
  await userEvent.click(await screen.findByRole('button', { name: 'Brainstorm' }));
  const sheet = await screen.findByRole('dialog', { name: 'Brainstorm' });
  return { ...fake, sheet };
};

describe('the way into the brainstorm chat', () => {
  it('is the overview’s top bar action and nothing else', async () => {
    renderApp({ client: fakeClient().client, path: '/' });
    const bar = await screen.findByRole('banner');

    expect(screen.getAllByRole('button', { name: 'Brainstorm' })).toEqual([
      within(bar).getByRole('button', { name: 'Brainstorm' }),
    ]);
  });

  it('floats over no screen', async () => {
    const agent = fakeAgent();
    renderApp({
      client: fakeClient({ agents: new Map([[agent.ref, agent]]) }).client,
      path: `/agents/${agent.ref}`,
    });
    await screen.findByRole('heading', { name: agent.ref });

    expect(screen.queryByRole('button', { name: 'Brainstorm' })).toBeNull();
  });

  it('opens the chat ready to type, and closing returns to the screen', async () => {
    const { sheet } = await openChat();

    expect(within(sheet).getByRole('textbox', { name: 'Message' })).toBeDefined();
    expect(within(sheet).getByText(/Note an idea in a few words/u)).toBeDefined();

    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog', { name: 'Brainstorm' })).toBeNull();
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Brainstorm' }),
    ).toBeDefined();
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
          entries: [{ type: 'user', id: 'u1', at: 1, text: 'Idea: dark mode', images: [] }],
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
          { type: 'user', id: 'u1', at: 1, text: 'Idea', images: [] },
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
      reason: 'Set COMMS_BRAINSTORM_PROVIDER and COMMS_BRAINSTORM_MODEL.',
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
      ready({ entries: [{ type: 'user', id: 'u1', at: 1, text: 'Idea', images: [] }] }),
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
            pictures: [],
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

describe('an edit in the brainstorm chat', () => {
  it('applies the title and body as the owner edited them, next to the current version', async () => {
    const { sheet, calls } = await openChat(ready({ entries: [edit] }));
    const card = await within(sheet).findByRole('region', { name: 'Proposed edit of issue #11' });

    await userEvent.click(within(card).getByRole('button', { name: /Current version/u }));
    expect(within(card).getByRole('group', { name: 'Current version' }).textContent).toContain(
      'An orchestrator agent.',
    );
    const body = within(card).getByRole('textbox', { name: 'Body' });
    await userEvent.clear(body);
    await userEvent.type(body, 'Edited.');
    await userEvent.click(within(card).getByRole('button', { name: 'Apply edit' }));

    await waitFor(() =>
      expect(calls.decisions).toEqual([
        ['e1', { _tag: 'Apply', title: 'Orchestrator mode', body: 'Edited.', pictures: [] }],
      ]),
    );
  });

  it('keeps the card open and says why when the issue changed', async () => {
    const { sheet, calls, state } = await openChat(ready({ entries: [edit] }));
    const card = await within(sheet).findByRole('region', { name: 'Proposed edit of issue #11' });

    state.brainstormFailure = new RequestError('Issue #11 changed since Pi read it.', 409);
    await userEvent.click(within(card).getByRole('button', { name: 'Apply edit' }));
    expect((await within(card).findByRole('alert')).textContent).toBe(
      'Issue #11 changed since Pi read it.',
    );
    expect(within(card).getByRole('button', { name: 'Apply edit' })).toBeTruthy();

    await userEvent.click(within(card).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(calls.decisions).toEqual([['e1', { _tag: 'Discard' }]]));
  });

  it('links an updated issue and offers no more actions', async () => {
    const { sheet } = await openChat(
      ready({ entries: [{ ...edit, state: { _tag: 'updated', url: 'http://gitea/i/11' } }] }),
    );

    expect(
      (await within(sheet).findByRole('link', { name: 'Issue #11 updated' })).getAttribute('href'),
    ).toBe('http://gitea/i/11');
    expect(within(sheet).queryByRole('button', { name: 'Apply edit' })).toBeNull();
  });
});

describe('pictures in the brainstorm chat', () => {
  const A = 'a'.repeat(26);
  const B = 'b'.repeat(26);
  const picture = (id: string, number: number, available = true) => ({ id, number, available });
  const picker = () => document.querySelector<HTMLInputElement>('input[type="file"]');

  it('attaches pictures and sends their ids with the message', async () => {
    const { sheet, calls } = await openChat();

    await userEvent.upload(picker() as HTMLInputElement, [
      new File(['x'], 'door.png', { type: 'image/png' }),
    ]);
    expect(await within(sheet).findByRole('img', { name: 'Image 1' })).toBeDefined();
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Message' }), 'Like this?');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(calls.brainstormMessages).toEqual(['Like this?']));
    expect(calls.brainstormImageIds).toEqual([['image-1']]);
  });

  it('says next to the composer that the model cannot see pictures', async () => {
    const { sheet } = await openChat(ready({ seesPictures: false }));

    expect(within(sheet).queryByText("This model can't see pictures")).toBeNull();
    await userEvent.upload(picker() as HTMLInputElement, [
      new File(['x'], 'door.png', { type: 'image/png' }),
    ]);

    expect(await within(sheet).findByText("This model can't see pictures")).toBeDefined();
  });

  it('shows a message’s pictures by number, and says when the model cannot see them', async () => {
    const { sheet } = await openChat(
      ready({
        entries: [{ type: 'user', id: 'u1', at: 1, text: 'Look', images: [A, B] }],
        pictures: [picture(A, 1), picture(B, 2)],
        seesPictures: false,
      }),
    );

    expect((await within(sheet).findByRole('img', { name: 'Picture 2' })).getAttribute('src')).toBe(
      `/api/v1/images/${B}`,
    );
    expect(within(sheet).getByRole('img', { name: 'Picture 1' })).toBeDefined();
    expect(within(sheet).getByText("This model can't see pictures")).toBeDefined();
  });

  it('checks the pictures Pi named and sends the owner’s choice in number order', async () => {
    const { sheet, calls } = await openChat(
      ready({
        entries: [{ ...proposal, pictures: [B] }],
        pictures: [picture(A, 1), picture(B, 2)],
      }),
    );
    const card = await within(sheet).findByRole('region', { name: 'Proposed issue: Dark mode' });

    expect(within(card).getByRole('checkbox', { name: 'Attach picture 2' })).toHaveProperty(
      'checked',
      true,
    );
    const first = within(card).getByRole('checkbox', { name: 'Attach picture 1' });
    expect(first).toHaveProperty('checked', false);
    await userEvent.click(first);
    await userEvent.click(within(card).getByRole('button', { name: 'Create issue' }));

    await waitFor(() =>
      expect(calls.decisions).toEqual([
        [
          'p1',
          {
            _tag: 'Create',
            draft: { project: 'pocket-home', title: 'Dark mode', body: 'A toggle.' },
            pictures: [A, B],
          },
        ],
      ]),
    );
  });

  it('shows a removed picture that cannot be checked', async () => {
    const { sheet } = await openChat(
      ready({ entries: [proposal], pictures: [picture(A, 1, false)] }),
    );
    const card = await within(sheet).findByRole('region', { name: 'Proposed issue: Dark mode' });

    expect(within(card).getByRole('checkbox', { name: 'Attach picture 1' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(within(card).getByText('Removed')).toBeDefined();
  });

  it('checks at most five pictures', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map((letter) => letter.repeat(26));
    const { sheet } = await openChat(
      ready({
        entries: [{ ...proposal, pictures: ids.slice(0, 5) }],
        pictures: ids.map((id, index) => picture(id, index + 1)),
      }),
    );
    const card = await within(sheet).findByRole('region', { name: 'Proposed issue: Dark mode' });

    expect(within(card).getByRole('checkbox', { name: 'Attach picture 6' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(within(card).getByRole('checkbox', { name: 'Attach picture 5' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('offers a retry and finishing without the pictures while they are not attached', async () => {
    const { sheet, calls } = await openChat(
      ready({
        entries: [
          {
            ...proposal,
            pictures: [A, B],
            attached: [{ image: A, url: 'http://gitea/attachments/1' }],
            state: { _tag: 'attaching', number: 12, url: 'http://gitea/i/12' },
          },
        ],
        pictures: [picture(A, 1), picture(B, 2)],
      }),
    );
    const card = await within(sheet).findByRole('region', { name: 'Proposed issue: Dark mode' });

    expect(within(card).getByRole('link', { name: 'Issue #12 created' })).toBeDefined();
    expect(within(card).getByText(/pictures are not attached yet/u)).toBeDefined();
    await userEvent.click(within(card).getByRole('button', { name: 'Retry' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Finish without them' }));

    await waitFor(() =>
      expect(calls.decisions).toEqual([
        [
          'p1',
          {
            _tag: 'Create',
            draft: { project: 'pocket-home', title: 'Dark mode', body: 'A toggle.' },
            pictures: [A, B],
          },
        ],
        ['p1', { _tag: 'FinishWithout' }],
      ]),
    );
  });

  it('shows the pictures that went along with a created issue', async () => {
    const { sheet } = await openChat(
      ready({
        entries: [
          {
            ...proposal,
            pictures: [A],
            attached: [{ image: A, url: 'http://gitea/attachments/1' }],
            state: { _tag: 'created', number: 12, url: 'http://gitea/i/12' },
          },
        ],
        pictures: [picture(A, 1)],
      }),
    );
    const card = await within(sheet).findByRole('region', { name: 'Proposed issue: Dark mode' });

    expect(within(card).getByRole('img', { name: 'Picture 1' })).toBeDefined();
    expect(within(card).queryByRole('checkbox')).toBeNull();
  });

  it('applies an edit with the chosen pictures', async () => {
    const { sheet, calls } = await openChat(
      ready({ entries: [{ ...edit, pictures: [A] }], pictures: [picture(A, 1)] }),
    );
    const card = await within(sheet).findByRole('region', { name: 'Proposed edit of issue #11' });

    await userEvent.click(within(card).getByRole('button', { name: 'Apply edit' }));

    await waitFor(() =>
      expect(calls.decisions).toEqual([
        [
          'e1',
          {
            _tag: 'Apply',
            title: 'Orchestrator mode',
            body: 'Control agents from the chat.',
            pictures: [A],
          },
        ],
      ]),
    );
  });
});
