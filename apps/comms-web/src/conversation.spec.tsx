import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
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

    await userEvent.click(screen.getByRole('button', { name: 'Screen' }));

    const terminal = await screen.findByRole('region', { name: 'Screen of kirk' });
    await waitFor(() => expect(terminal.textContent).toContain('Allow command?'));
    expect(screen.getByRole('group', { name: 'Keys' })).toBeDefined();
  });

  it('shows only the screen for an agent without a chat', async () => {
    open(fakeAgent({ kind: 'codex', format: undefined }));

    expect(await screen.findByRole('region', { name: 'Screen of kirk' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull();
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
    expect(screen.getByText('Answer above to continue')).toBeDefined();

    await userEvent.click(
      within(screen.getByRole('group', { name: 'Keys' })).getByRole('button', { name: '1' }),
    );

    await waitFor(() => expect(fake.calls.keys).toEqual([['kirk', ['1']]]));
  });

  it('sends nothing on a short tap of Ctrl-C', async () => {
    const fake = open(fakeAgent({ status: 'blocked', needsYou: true }));

    await userEvent.click(await screen.findByRole('button', { name: 'Hold to send Control C' }));

    expect(fake.calls.keys).toEqual([]);
  });

  it('sends Ctrl-C after a long press', async () => {
    const fake = open(fakeAgent({ status: 'blocked', needsYou: true }));
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

    await userEvent.click(screen.getByRole('button', { name: 'Screen' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Keys' })).getByRole('button', { name: 'Enter' }),
    );

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('replaces the composer with the keys for a blocked agent without a chat', async () => {
    open(fakeAgent({ kind: 'codex', format: undefined, status: 'blocked', needsYou: true }));

    expect(await screen.findByRole('group', { name: 'Keys' })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(screen.getByText('Answer with the keys')).toBeDefined();
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
