import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { TranscriptView } from './comms-client.js';
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

  it('says when the agent is gone', async () => {
    renderApp({ client: fakeClient().client, path: '/agents/nobody' });

    expect(await screen.findByText('nobody is not running any more.')).toBeDefined();
  });
});
