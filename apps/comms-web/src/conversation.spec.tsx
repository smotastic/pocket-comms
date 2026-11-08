import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TerminalScreen } from '@smotastic/pocket-design';
import { axeViolations } from '@smotastic/pocket-design/testing';
import { RequestError, type AgentView, type TranscriptView } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const transcript: TranscriptView = {
  entries: [
    { type: 'user', id: 'u1', at: 1, text: 'Fix the failing test' },
    { type: 'assistant', id: 'a1', at: 2, text: 'I fixed **it**.' },
    {
      type: 'tool',
      id: 't1',
      at: 3,
      verb: 'Edited',
      target: 'src/a.ts',
      added: 12,
      removed: 3,
      outcome: 'ok',
    },
    { type: 'tool', id: 't2', at: 4, verb: 'Ran', target: 'pnpm test', outcome: 'pending' },
  ],
  activity: 'Running pnpm test…',
};

const open = (agent = fakeAgent({ status: 'working' }), extra: { screen?: string } = {}) => {
  const fake = fakeClient({
    agents: new Map([[agent.ref, agent]]),
    transcripts: new Map([[agent.ref, transcript]]),
    screens: new Map([[agent.ref, extra.screen ?? '\u001b[1mAllow command?\u001b[0m']]),
  });
  return { ...fake, ...renderApp({ client: fake.client, path: `/agents/${agent.ref}` }) };
};

/** Opens the top bar's More sheet. */
const openMore = async () => {
  const banner = await screen.findByRole('banner');
  await userEvent.click(within(banner).getByRole('button', { name: 'More' }));
  return screen.findByRole('dialog', { name: 'More' });
};

/** Opens the footer's Controls, which hold the keys and the quick replies. */
const openControls = async () =>
  userEvent.click(await screen.findByRole('button', { name: /^Controls/ }));

describe('the conversation', () => {
  it('renders the session as a chat', async () => {
    open();

    expect(await screen.findByText('Fix the failing test')).toBeDefined();
    expect(await screen.findByText('it')).toBeDefined();
    expect(screen.getByText('Edited')).toBeDefined();
    expect(screen.getByText('src/a.ts')).toBeDefined();
    expect((await screen.findByRole('status')).textContent).toContain('Running pnpm test…');
  });

  it('adds new entries from the live stream', async () => {
    const fake = open();
    await screen.findByText('Fix the failing test');

    act(() =>
      fake.emitAgent('kirk', {
        type: 'entries',
        reset: false,
        entries: [{ type: 'assistant', id: 'a2', at: 5, text: 'All green now.' }],
        activity: 'Thinking…',
      }),
    );

    expect(await screen.findByText('All green now.')).toBeDefined();
  });

  it("shows an agent's questions with the owner's answers", async () => {
    const fake = open();
    await screen.findByText('Fix the failing test');

    act(() =>
      fake.emitAgent('kirk', {
        type: 'entries',
        reset: false,
        entries: [
          {
            type: 'tool',
            id: 'q1',
            at: 5,
            verb: 'Used',
            target: 'AskUserQuestion',
            questions: [
              { header: 'Monorepo', text: 'Keep the Nx monorepo setup?', answer: 'Keep Nx' },
            ],
            outcome: 'ok',
          },
        ],
        activity: 'Thinking…',
      }),
    );

    expect(await screen.findByText('Keep the Nx monorepo setup?')).toBeDefined();
    expect(screen.getByText('Monorepo')).toBeDefined();
    expect(screen.getByText('Keep Nx')).toBeDefined();
    expect(screen.queryByText('AskUserQuestion')).toBeNull();
  });

  it('marks a done agent as seen', async () => {
    const fake = open(fakeAgent({ status: 'done', needsYou: true }));

    await waitFor(() => expect(fake.calls.seen).toEqual(['kirk']));
  });

  it('switches to the screen', async () => {
    open();
    await screen.findByText('Fix the failing test');

    await userEvent.click(screen.getByRole('radio', { name: 'Screen' }));

    const terminal = await screen.findByRole('region', { name: 'Screen of kirk' });
    await waitFor(() => expect(terminal.textContent).toContain('Allow command?'));
    await openControls();
    expect(screen.getByRole('group', { name: 'Keys' })).toBeDefined();
  });

  it('shows only the screen for an agent without a chat', async () => {
    open(fakeAgent({ kind: 'codex', format: undefined }));

    expect(await screen.findByRole('region', { name: 'Screen of kirk' })).toBeDefined();
    expect(screen.queryByRole('radio', { name: 'Chat' })).toBeNull();
  });

  it('sends a prompt with Enter and clears the composer', async () => {
    const fake = open(fakeAgent({ status: 'idle' }));
    const box = await screen.findByRole('textbox', { name: 'Message' });

    await userEvent.type(box, 'Run the tests{Enter}');

    await waitFor(() => expect(fake.calls.prompts).toEqual([['kirk', 'Run the tests']]));
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''));
  });

  it('keeps the draft and says why when a prompt fails', async () => {
    const fake = open(fakeAgent({ status: 'idle' }));
    fake.state.promptFailure = 'agent wJ:p1 is not ready';
    const box = await screen.findByRole('textbox', { name: 'Message' });

    await userEvent.type(box, 'Hello{Enter}');

    expect((await screen.findByRole('alert')).textContent).toContain('not ready');
    expect((box as HTMLTextAreaElement).value).toBe('Hello');
  });

  it('replaces the composer with the approval panel while the agent is blocked', async () => {
    const fake = open(fakeAgent({ status: 'blocked', needsYou: true }));

    const panel = await screen.findByRole('region', { name: 'Claude needs your answer' });
    await waitFor(() => expect(panel.textContent).toContain('Allow command?'));
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();

    await openControls();
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Keys' })).getByRole('button', { name: '1' }),
    );

    await waitFor(() => expect(fake.calls.keys).toEqual([['kirk', ['1']]]));
  });

  it('wraps the question to the width of a phone, while the screen keeps its terminal lines', async () => {
    // The kit's classes for a wrapped and an unwrapped screen; jsdom applies no stylesheet.
    const lines = (wrap: boolean) => {
      const { container, unmount } = render(<TerminalScreen label="Lines" text="" wrap={wrap} />);
      const className = container.querySelector('pre')?.className;
      unmount();
      return className;
    };
    const wrapped = lines(true);
    const kept = lines(false);
    expect(wrapped).not.toBe(kept);
    open(fakeAgent({ status: 'blocked', needsYou: true }));

    const panel = await screen.findByRole('region', { name: 'Claude needs your answer' });
    await waitFor(() => expect(panel.textContent).toContain('Allow command?'));
    expect(panel.querySelector('pre')?.className).toBe(wrapped);

    await userEvent.click(screen.getByRole('radio', { name: 'Screen' }));
    const terminal = await screen.findByRole('region', { name: 'Screen of kirk' });
    expect(terminal.querySelector('pre')?.className).toBe(kept);
  });

  it('pages up to the start of a long question on the screen, which keeps the keys', async () => {
    const fake = open(fakeAgent({ status: 'blocked', needsYou: true }));

    await openControls();
    const keys = await screen.findByRole('group', { name: 'Keys' });
    await userEvent.click(within(keys).getByRole('button', { name: 'Page up' }));

    await waitFor(() => expect(fake.calls.keys).toEqual([['kirk', ['pageup']]]));
    expect(await screen.findByRole('region', { name: 'Screen of kirk' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Claude needs your answer' })).toBeNull();
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Keys' })).getByRole('button', {
        name: 'Page down',
      }),
    );
    await waitFor(() =>
      expect(fake.calls.keys).toEqual([
        ['kirk', ['pageup']],
        ['kirk', ['pagedown']],
      ]),
    );
  });

  it('moves between questions with the Left and Right keys', async () => {
    const fake = open(fakeAgent({ status: 'blocked', needsYou: true }));

    await openControls();
    const keys = await screen.findByRole('group', { name: 'Keys' });
    expect(within(keys).getByRole('button', { name: 'Left' }).textContent).toBe('←');
    await userEvent.click(within(keys).getByRole('button', { name: 'Right' }));
    await waitFor(() => expect(fake.calls.keys).toEqual([['kirk', ['right']]]));
    await userEvent.click(within(keys).getByRole('button', { name: 'Left' }));

    await waitFor(() =>
      expect(fake.calls.keys).toEqual([
        ['kirk', ['right']],
        ['kirk', ['left']],
      ]),
    );
  });

  it('sends nothing on a short tap of Ctrl-C', async () => {
    const fake = open(fakeAgent({ status: 'blocked', needsYou: true }));

    await openControls();
    await userEvent.click(await screen.findByRole('button', { name: 'Hold to send Control C' }));

    expect(fake.calls.keys).toEqual([]);
  });

  it('sends Ctrl-C after a long press', async () => {
    const fake = open(fakeAgent({ status: 'blocked', needsYou: true }));
    await openControls();
    const ctrlC = await screen.findByRole('button', { name: 'Hold to send Control C' });

    fireEvent.pointerDown(ctrlC);
    await new Promise((resolve) => setTimeout(resolve, 700));
    fireEvent.pointerUp(ctrlC);

    await waitFor(() => expect(fake.calls.keys).toEqual([['kirk', ['ctrl+c']]]));
  });

  it('cannot send an empty message', async () => {
    open(fakeAgent({ status: 'idle' }));

    await screen.findByRole('textbox', { name: 'Message' });

    expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
  });

  it('clears the reason of a failed prompt once a key press works', async () => {
    const fake = open(fakeAgent({ status: 'idle' }));
    fake.state.promptFailure = 'agent wJ:p1 is not ready';
    await userEvent.type(await screen.findByRole('textbox', { name: 'Message' }), 'Hi{Enter}');
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('radio', { name: 'Screen' }));
    await openControls();
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Keys' })).getByRole('button', { name: 'Enter' }),
    );

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('replaces the composer with the keys for a blocked agent without a chat', async () => {
    open(fakeAgent({ kind: 'codex', format: undefined, status: 'blocked', needsYou: true }));

    await openControls();
    expect(await screen.findByRole('group', { name: 'Keys' })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Type into the dialog' })).toBeDefined();
  });

  it('offers no keys before it knows the agent', async () => {
    const fake = open();
    fake.state.agents.clear();
    cleanup();
    let release: () => void = () => undefined;
    const client = {
      ...fake.client,
      agent: () =>
        new Promise<ReturnType<typeof fakeAgent>>(
          (resolve) => (release = () => resolve(fakeAgent())),
        ),
    };
    renderApp({ client, path: '/agents/kirk' });

    expect(await screen.findByText('Loading the agent…')).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Keys' })).toBeNull();
    act(() => release());
  });

  it('tries again when marking a done agent as seen fails', async () => {
    const fake = open(fakeAgent({ status: 'done', needsYou: true }));
    cleanup();
    let attempts = 0;
    const client = {
      ...fake.client,
      seen: async (ref: string) => {
        attempts += 1;
        if (attempts === 1) throw new Error('Network down');
        fake.calls.seen.push(ref);
      },
    };
    renderApp({ client, path: '/agents/kirk' });

    await waitFor(() => expect(attempts).toBe(2), { timeout: 4_000 });
  });

  it('says so when the agent has no conversation yet', async () => {
    const fake = open();
    cleanup();
    const client = {
      ...fake.client,
      transcript: () => Promise.reject(new RequestError('No session file for session s1.', 404)),
    };
    renderApp({ client, path: '/agents/kirk' });

    expect(await screen.findByText('No conversation yet.')).toBeDefined();
  });

  it('says when the agent is gone', async () => {
    renderApp({ client: fakeClient().client, path: '/agents/nobody' });

    expect(await screen.findByText('nobody is not running any more.')).toBeDefined();
  });
});

describe('typed answers and quick replies', () => {
  const chip = async (name: string) =>
    within(await screen.findByRole('grid', { name: 'Quick replies' })).getByRole('row', { name });

  it('keeps the keys and the quick replies collapsed under Controls, beside the dialog field', async () => {
    open(fakeAgent({ status: 'blocked', needsYou: true }));
    await screen.findByRole('textbox', { name: 'Type into the dialog' });

    const controls = screen.getByRole('button', { name: /^Controls/ });
    expect(controls.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('group', { name: 'Keys' })).toBeNull();
    expect(screen.queryByRole('grid', { name: 'Quick replies' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Claude needs your answer' })).toBeDefined();
  });

  it('keeps the controls open across presses and a switch of the view', async () => {
    const fake = open(fakeAgent({ status: 'blocked', needsYou: true }));
    await openControls();

    await userEvent.click(
      within(screen.getByRole('group', { name: 'Keys' })).getByRole('button', { name: 'Down' }),
    );
    await waitFor(() => expect(fake.calls.keys).toEqual([['kirk', ['down']]]));
    await userEvent.click(screen.getByRole('radio', { name: 'Screen' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Keys' })).getByRole('button', { name: 'Enter' }),
    );

    await waitFor(() =>
      expect(fake.calls.keys).toEqual([
        ['kirk', ['down']],
        ['kirk', ['enter']],
      ]),
    );
  });

  it.each(['Chat', 'Screen'])(
    'offers the keys, the quick replies and the dialog field in the %s view',
    async (view) => {
      open(fakeAgent({ status: 'blocked', needsYou: true }));
      await screen.findByRole('textbox', { name: 'Type into the dialog' });
      await userEvent.click(screen.getByRole('radio', { name: view }));
      await openControls();

      expect(screen.getByRole('group', { name: 'Keys' })).toBeDefined();
      expect(await chip('Go ahead')).toBeDefined();
      expect(await chip('Commit and open a PR')).toBeDefined();
      expect(
        screen.getByText(
          'Choose Type something or Other with the keys first, then press Enter to submit.',
        ),
      ).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Attach image' })).toBeNull();
    },
  );

  it('types the answer into the dialog without a prompt or a key, and clears the field', async () => {
    const fake = open(fakeAgent({ status: 'blocked', needsYou: true }));
    await userEvent.click(await screen.findByRole('radio', { name: 'Screen' }));
    const box = screen.getByRole('textbox', { name: 'Type into the dialog' });

    await userEvent.type(box, 'Use SQLite instead{Enter}');

    await waitFor(() => expect(fake.calls.typed).toEqual([['kirk', 'Use SQLite instead']]));
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''));
    expect(fake.calls.prompts).toEqual([]);
    expect(fake.calls.keys).toEqual([]);
  });

  it('keeps the answer and says why when typing fails', async () => {
    const fake = open(fakeAgent({ status: 'blocked', needsYou: true }));
    fake.state.typeFailure = 'Herdr refused the text';
    const box = await screen.findByRole('textbox', { name: 'Type into the dialog' });

    await userEvent.type(box, 'Use SQLite{Enter}');

    expect((await screen.findByRole('alert')).textContent).toContain('Herdr refused the text');
    expect((box as HTMLTextAreaElement).value).toBe('Use SQLite');
  });

  it('types a quick reply into the waiting dialog', async () => {
    const fake = open(fakeAgent({ status: 'blocked', needsYou: true }));
    await screen.findByRole('textbox', { name: 'Type into the dialog' });
    await openControls();

    await userEvent.click(await chip('Commit and open a PR'));

    await waitFor(() => expect(fake.calls.typed).toEqual([['kirk', 'Commit and open a PR']]));
    expect(fake.calls.prompts).toEqual([]);
  });

  it('sends a quick reply as a prompt while no dialog waits, and keeps the draft', async () => {
    const fake = open(fakeAgent({ status: 'idle' }));
    const box = await screen.findByRole('textbox', { name: 'Message' });
    await userEvent.type(box, 'Half a thought');
    await openControls();

    await userEvent.click(await chip('Go ahead'));

    await waitFor(() => expect(fake.calls.prompts).toEqual([['kirk', 'Go ahead']]));
    expect(fake.calls.typed).toEqual([]);
    expect((box as HTMLTextAreaElement).value).toBe('Half a thought');
  });

  it('holds the keys and the quick replies until the typed text arrives, then clears the field', async () => {
    const fake = open(fakeAgent({ status: 'blocked', needsYou: true }));
    let release: () => void = () => undefined;
    fake.state.typeGate = new Promise((resolve) => (release = resolve));
    const box = await screen.findByRole('textbox', { name: 'Type into the dialog' });
    await openControls();

    await userEvent.type(box, 'Use SQLite{Enter}');

    const enter = within(screen.getByRole('group', { name: 'Keys' })).getByRole('button', {
      name: 'Enter',
    });
    await waitFor(() => expect(enter.hasAttribute('disabled')).toBe(true));
    expect((await chip('Go ahead')).getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(enter);
    expect(fake.calls.keys).toEqual([]);

    act(() => release());

    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''));
    expect(enter.hasAttribute('disabled')).toBe(false);
  });

  it('keeps both drafts across a dialog and drops the reason of a failed type after it', async () => {
    const fake = open(fakeAgent({ status: 'idle' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Message' }), 'Later');
    act(() =>
      fake.emitAgent('kirk', {
        type: 'agent',
        agent: fakeAgent({ status: 'blocked', needsYou: true }),
      }),
    );
    fake.state.typeFailure = 'Herdr refused the text';
    const box = await screen.findByRole('textbox', { name: 'Type into the dialog' });
    await userEvent.type(box, 'Use SQLite{Enter}');
    await screen.findByRole('alert');

    act(() => fake.emitAgent('kirk', { type: 'agent', agent: fakeAgent({ status: 'idle' }) }));

    const message = await screen.findByRole('textbox', { name: 'Message' });
    expect((message as HTMLTextAreaElement).value).toBe('Later');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('has no accessibility violations while a dialog waits', async () => {
    open(fakeAgent({ status: 'blocked', needsYou: true }));
    await screen.findByRole('textbox', { name: 'Type into the dialog' });

    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('offers the quick replies in the Screen view of an idle agent', async () => {
    open(fakeAgent({ status: 'idle' }));
    await userEvent.click(await screen.findByRole('radio', { name: 'Screen' }));
    await openControls();

    expect(await chip('Go ahead')).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDefined();
  });
});

describe("suggested replies and the owner's quick replies (spec 025)", () => {
  const asks: TranscriptView = {
    entries: [
      { type: 'user', id: 'u1', at: 1, text: 'Plan the change' },
      {
        type: 'assistant',
        id: 'a1',
        at: 2,
        text: 'Here is the plan.\n\nDo you approve?',
        replies: ['Approved', 'No, revise'],
      },
    ],
    activity: 'Thinking…',
  };

  const openAsking = (
    agent: AgentView = fakeAgent({ status: 'idle' }),
    conversation: TranscriptView = asks,
    quickReplies?: ReadonlyArray<string>,
  ) => {
    const fake = fakeClient({
      agents: new Map([[agent.ref, agent]]),
      transcripts: new Map([[agent.ref, conversation]]),
      ...(quickReplies === undefined ? {} : { quickReplies }),
    });
    return { ...fake, ...renderApp({ client: fake.client, path: `/agents/${agent.ref}` }) };
  };

  const suggestions = () => screen.queryByRole('grid', { name: 'Suggested replies' });

  it('offers the replies the latest message calls for and sends one once', async () => {
    const fake = openAsking();
    const grid = await screen.findByRole('grid', { name: 'Suggested replies' });
    expect(within(grid).getByRole('row', { name: 'No, revise' })).toBeDefined();

    await userEvent.click(within(grid).getByRole('row', { name: 'Approved' }));

    await waitFor(() => expect(fake.calls.prompts).toEqual([['kirk', 'Approved']]));
    await waitFor(() => expect(suggestions()).toBeNull());
    expect(fake.calls.typed).toEqual([]);
    expect(fake.calls.keys).toEqual([]);
  });

  it('offers the suggestions of a newer message after one was sent', async () => {
    const fake = openAsking();
    const grid = await screen.findByRole('grid', { name: 'Suggested replies' });
    await userEvent.click(within(grid).getByRole('row', { name: 'Approved' }));
    await waitFor(() => expect(suggestions()).toBeNull());

    act(() =>
      fake.emitAgent('kirk', {
        type: 'entries',
        reset: false,
        entries: [
          { type: 'user', id: 'u2', at: 3, text: 'Approved' },
          { type: 'assistant', id: 'a2', at: 4, text: '1. A\n2. B', replies: ['A', 'B'] },
        ],
        activity: 'Thinking…',
      }),
    );

    const next = await screen.findByRole('grid', { name: 'Suggested replies' });
    expect(within(next).getByRole('row', { name: 'B' })).toBeDefined();
  });

  it('hides the suggestions once a quick reply answered the message', async () => {
    const fake = openAsking();
    await screen.findByRole('grid', { name: 'Suggested replies' });
    await openControls();
    const quick = await screen.findByRole('grid', { name: 'Quick replies' });

    await userEvent.click(within(quick).getByRole('row', { name: 'Go ahead' }));

    await waitFor(() => expect(fake.calls.prompts).toEqual([['kirk', 'Go ahead']]));
    await waitFor(() => expect(suggestions()).toBeNull());
  });

  it.each([
    ['blocked', fakeAgent({ status: 'blocked', needsYou: true })],
    ['working', fakeAgent({ status: 'working' })],
  ])('offers no suggestions to a %s agent', async (_, agent) => {
    openAsking(agent);
    await openControls();
    await screen.findByRole('grid', { name: 'Quick replies' });
    await screen.findByText('Plan the change');

    expect(suggestions()).toBeNull();
  });

  it('offers no suggestions in the Screen view', async () => {
    openAsking();
    await screen.findByRole('grid', { name: 'Suggested replies' });

    await userEvent.click(screen.getByRole('radio', { name: 'Screen' }));

    expect(suggestions()).toBeNull();
  });

  it('offers no suggestions when the latest entry is not the asking message', async () => {
    openAsking(fakeAgent({ status: 'idle' }), {
      ...asks,
      entries: [...asks.entries, { type: 'user', id: 'u2', at: 3, text: 'Wait' }],
    });
    await screen.findByText('Wait');
    await openControls();
    await screen.findByRole('grid', { name: 'Quick replies' });

    expect(suggestions()).toBeNull();
  });

  it("offers the owner's own quick replies, in their order", async () => {
    const fake = openAsking(fakeAgent({ status: 'idle' }), asks, [
      'Run the tests first',
      'Ship it',
    ]);
    await openControls();
    const grid = await screen.findByRole('grid', { name: 'Quick replies' });

    expect(
      within(grid)
        .getAllByRole('row')
        .map((row) => row.textContent),
    ).toEqual(['Run the tests first', 'Ship it']);
    await userEvent.click(within(grid).getByRole('row', { name: 'Run the tests first' }));
    await waitFor(() => expect(fake.calls.prompts).toEqual([['kirk', 'Run the tests first']]));
  });

  it('shows no quick replies row for an empty list', async () => {
    openAsking(fakeAgent({ status: 'idle' }), asks, []);
    await screen.findByRole('grid', { name: 'Suggested replies' });

    expect(screen.queryByRole('grid', { name: 'Quick replies' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Controls/ })).toBeNull();
  });

  it('has no accessibility violations with suggestions', async () => {
    openAsking();
    await screen.findByRole('grid', { name: 'Suggested replies' });
    await openControls();
    await screen.findByRole('grid', { name: 'Quick replies' });

    expect(await axeViolations(document.body)).toEqual([]);
  });
});

describe('closing an agent', () => {
  const worktreeAgent = (overrides: Partial<AgentView> = {}) =>
    fakeAgent({ workspace: 'feature', worktree: 'feature', ...overrides });

  const openWorktree = (others: ReadonlyArray<AgentView> = []) => {
    const agent = worktreeAgent();
    const fake = open(agent);
    fake.state.overview = {
      needsYou: [],
      groups: [{ key: '/work/app/.git', name: 'app', agents: [agent, ...others] }],
    };
    return fake;
  };

  const confirm = async (name: string) => {
    const sheet = await screen.findByRole('dialog', { name: 'Close kirk' });
    await userEvent.click(within(sheet).getByRole('button', { name }));
    return sheet;
  };

  it('offers no Close for an agent in a main checkout', async () => {
    open(fakeAgent());
    await screen.findByText('Fix the failing test');
    const more = await openMore();

    expect(within(more).getAllByRole('button')).toEqual([
      within(more).getByRole('button', { name: 'Close' }),
      within(more).getByRole('button', { name: 'Brainstorm with Pi' }),
    ]);
    expect(screen.queryByRole('button', { name: 'Close kirk' })).toBeNull();
  });

  it('offers Brainstorm with Pi before Close, and closes More before asking', async () => {
    openWorktree();
    const more = await openMore();

    expect(within(more).getAllByRole('button')).toEqual([
      within(more).getByRole('button', { name: 'Close' }),
      within(more).getByRole('button', { name: 'Brainstorm with Pi' }),
      within(more).getByRole('button', { name: 'Close kirk' }),
    ]);
    await userEvent.click(within(more).getByRole('button', { name: 'Close kirk' }));

    expect(await screen.findByRole('dialog', { name: 'Close kirk' })).toBeDefined();
    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
  });

  it('closes the worktree after the confirmation and goes back', async () => {
    const fake = openWorktree();
    await userEvent.click(within(await openMore()).getByRole('button', { name: 'Close kirk' }));
    const sheet = await screen.findByRole('dialog', { name: 'Close kirk' });

    expect(within(sheet).getByText(/removes the worktree feature/u)).toBeDefined();
    expect(fake.calls.closedAgents).toEqual([]);
    await confirm('Close worktree');

    await waitFor(() => expect(fake.router.state.location.pathname).toBe('/'));
    expect(fake.calls.closedAgents).toEqual([['kirk', false]]);
  });

  it('names the other agents of the worktree, which close too', async () => {
    openWorktree([
      worktreeAgent({ ref: 'spock', name: 'spock', paneId: 'w1:p2' }),
      fakeAgent({ ref: 'uhura', name: 'uhura', paneId: 'w9:p1' }),
    ]);
    await userEvent.click(within(await openMore()).getByRole('button', { name: 'Close kirk' }));
    const sheet = await screen.findByRole('dialog', { name: 'Close kirk' });

    expect(await within(sheet).findByText(/spock closes too/u)).toBeDefined();
    expect(within(sheet).queryByText(/uhura/u)).toBeNull();
  });

  it('offers to discard the changes of a worktree that has some', async () => {
    const fake = openWorktree();
    fake.state.closeAgentFailures = [
      new RequestError('The worktree has changes.', 409, [], 'worktree-has-changes'),
    ];
    await userEvent.click(within(await openMore()).getByRole('button', { name: 'Close kirk' }));
    const sheet = await confirm('Close worktree');

    expect(await within(sheet).findByText(/changes that are not committed/u)).toBeDefined();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Discard changes and close' }));

    await waitFor(() => expect(fake.router.state.location.pathname).toBe('/'));
    expect(fake.calls.closedAgents).toEqual([
      ['kirk', false],
      ['kirk', true],
    ]);
  });

  it("shows Herdr's refusal and stays open", async () => {
    const fake = openWorktree();
    fake.state.closeAgentFailures = [
      new RequestError(
        'worktree is locked (worktree_remove_failed)',
        409,
        [],
        'worktree-not-removed',
      ),
    ];
    await userEvent.click(within(await openMore()).getByRole('button', { name: 'Close kirk' }));
    const sheet = await confirm('Close worktree');

    expect(await within(sheet).findByText(/worktree is locked/u)).toBeDefined();
    expect(within(sheet).getByRole('button', { name: 'Close worktree' })).toBeDefined();
    expect(fake.router.state.location.pathname).toBe('/agents/kirk');
  });
});

describe('the More menu', () => {
  it('holds the brainstorm chat and leaves the top bar to the agent', async () => {
    open(fakeAgent({ workspace: 'feature', worktree: 'feature' }));
    const banner = await screen.findByRole('banner');
    await screen.findByText('Fix the failing test');

    expect(within(banner).queryByRole('button', { name: 'Brainstorm' })).toBeNull();
    expect(within(banner).queryByRole('button', { name: 'Close kirk' })).toBeNull();
    await userEvent.click(
      within(await openMore()).getByRole('button', { name: 'Brainstorm with Pi' }),
    );

    expect(await screen.findByRole('dialog', { name: 'Brainstorm' })).toBeDefined();
    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
  });

  it('shows while the agent loads and when it is gone', async () => {
    const fake = fakeClient();
    renderApp({
      client: { ...fake.client, agent: () => new Promise(() => undefined) },
      path: '/agents/kirk',
    });
    await screen.findByText('Loading the agent…');
    expect(
      within(await openMore()).getByRole('button', { name: 'Brainstorm with Pi' }),
    ).toBeDefined();
    cleanup();

    renderApp({ client: fakeClient().client, path: '/agents/nobody' });
    await screen.findByText('nobody is not running any more.');
    expect(
      within(await openMore()).getByRole('button', { name: 'Brainstorm with Pi' }),
    ).toBeDefined();
  });

  it('closes without doing anything', async () => {
    const fake = open(fakeAgent({ workspace: 'feature', worktree: 'feature' }));
    const more = await openMore();
    await userEvent.click(within(more).getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Brainstorm' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Close kirk' })).toBeNull();
    expect(fake.calls.closedAgents).toEqual([]);
  });
});

describe('the brainstorm chat over a conversation', () => {
  it('leaves the draft in the composer', async () => {
    open();
    const box = await screen.findByRole('textbox', { name: 'Message' });
    await userEvent.type(box, 'half a thought');

    await userEvent.click(
      within(await openMore()).getByRole('button', { name: 'Brainstorm with Pi' }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Brainstorm' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog', { name: 'Brainstorm' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveProperty(
      'value',
      'half a thought',
    );
  });
});

describe('background work in the conversation', () => {
  const shell = {
    id: 'toolu-ci',
    kind: 'shell',
    description: 'Wait for CI',
    startedAt: Date.now() - 12 * 60_000,
    inBackground: true,
  } as const;
  const review = {
    id: 'toolu-rev',
    kind: 'subagent',
    description: 'Review the diff',
    startedAt: Date.now() - 3 * 60_000,
    inBackground: true,
    subagent: 'a1',
  } as const;
  const delegations: TranscriptView = {
    entries: [
      {
        type: 'tool',
        id: 'toolu-rev',
        at: 1,
        verb: 'Delegated',
        target: 'Review the diff',
        outcome: 'ok',
        subagent: 'a1',
      },
      {
        type: 'tool',
        id: 'toolu-old',
        at: 2,
        verb: 'Delegated',
        target: 'Find the config',
        outcome: 'ok',
        subagent: 'b2',
      },
      { type: 'tool', id: 'toolu-x', at: 3, verb: 'Delegated', target: 'Unknown', outcome: 'ok' },
    ],
    activity: 'Thinking…',
  };

  const openWith = (agent: AgentView) => {
    const fake = fakeClient({
      agents: new Map([[agent.ref, agent]]),
      transcripts: new Map([[agent.ref, delegations]]),
    });
    return { ...fake, ...renderApp({ client: fake.client, path: `/agents/${agent.ref}` }) };
  };

  it('shows a strip of the running work above the composer that opens to list it', async () => {
    const fake = openWith(fakeAgent({ status: 'done', background: [shell, review] }));

    const toggle = await screen.findByRole('button', { name: '2 running in the background' });
    await userEvent.click(toggle);

    const list = screen.getByRole('group', { name: '2 running in the background' });
    expect(within(list).getByText('Wait for CI')).toBeDefined();
    expect(within(list).getByText('12m')).toBeDefined();
    expect(within(list).getAllByRole('link')).toHaveLength(1);
    expect(within(list).getByRole('link').getAttribute('href')).toBe('/agents/kirk/subagents/a1');

    await userEvent.click(within(list).getByRole('link'));
    expect(fake.router.state.location.pathname).toBe('/agents/kirk/subagents/a1');
  });

  it('shows no strip without background work', async () => {
    openWith(fakeAgent({ status: 'done' }));

    await screen.findByText('Find the config');
    expect(screen.queryByRole('button', { name: /running in the background/u })).toBeNull();
  });

  it('removes the strip when the last item ends', async () => {
    const fake = openWith(fakeAgent({ status: 'working', background: [shell] }));
    await screen.findByRole('button', { name: '1 running in the background' });

    act(() => fake.emitAgent('kirk', { type: 'agent', agent: fakeAgent({ status: 'working' }) }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /running in the background/u })).toBeNull(),
    );
  });

  it("links each delegation to its subagent's conversation, with a hint while it runs", async () => {
    openWith(fakeAgent({ status: 'done', background: [review] }));

    const running = await screen.findByRole('link', {
      name: 'Delegated Review the diff succeeded running in the background',
    });
    expect(running.getAttribute('href')).toBe('/agents/kirk/subagents/a1');
    const ended = screen.getByRole('link', { name: 'Delegated Find the config succeeded' });
    expect(ended.getAttribute('href')).toBe('/agents/kirk/subagents/b2');
    expect(screen.queryByRole('link', { name: /Unknown/u })).toBeNull();
  });

  it("opens a subagent's conversation from its delegation", async () => {
    const fake = fakeClient({
      agents: new Map([['kirk', fakeAgent({ status: 'done' })]]),
      transcripts: new Map([['kirk', delegations]]),
      subagents: new Map([
        [
          'kirk/b2',
          {
            id: 'b2',
            description: 'Find the config',
            agentType: 'Explore',
            running: false,
            inBackground: false,
            entries: [{ type: 'user', id: 'su1', at: 1, text: 'Where is the config?' }],
            activity: 'Thinking…',
          },
        ],
      ]),
    });
    renderApp({ client: fake.client, path: '/agents/kirk' });

    await userEvent.click(
      await screen.findByRole('link', { name: 'Delegated Find the config succeeded' }),
    );

    expect(await screen.findByText('Where is the config?')).toBeDefined();
  });

  it('notes a running subagent whose id is not known yet, without a link', async () => {
    const pending: TranscriptView = {
      entries: [
        {
          type: 'tool',
          id: 'toolu-fg',
          at: 1,
          verb: 'Delegated',
          target: 'Look',
          outcome: 'pending',
        },
      ],
      activity: 'Delegating Look…',
    };
    const fake = fakeClient({
      agents: new Map([
        [
          'kirk',
          fakeAgent({
            status: 'working',
            background: [
              {
                id: 'toolu-fg',
                kind: 'subagent',
                description: 'Look',
                startedAt: 1,
                inBackground: false,
              },
            ],
          }),
        ],
      ]),
      transcripts: new Map([['kirk', pending]]),
    });
    renderApp({ client: fake.client, path: '/agents/kirk' });

    expect(await screen.findByText('running')).toBeDefined();
    expect(screen.queryByRole('link', { name: /Look/u })).toBeNull();
  });
});
