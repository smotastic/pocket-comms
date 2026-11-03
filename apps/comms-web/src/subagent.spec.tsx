import { act, cleanup, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { SubagentView } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const review: SubagentView = {
  id: 'a1',
  description: 'Review the diff',
  agentType: 'general-purpose',
  running: true,
  inBackground: true,
  entries: [
    { type: 'user', id: 'su1', at: 1, text: 'Review the images branch' },
    { type: 'assistant', id: 'sa1', at: 2, text: 'Looks **good**.' },
  ],
  activity: 'Thinking…',
};

const open = (path = '/agents/kirk/subagents/a1') => {
  const fake = fakeClient({
    agents: new Map([['kirk', fakeAgent()]]),
    subagents: new Map([['kirk/a1', review]]),
  });
  return { ...fake, ...renderApp({ client: fake.client, path }) };
};

describe("a subagent's conversation", () => {
  it('shows what the subagent was asked and did, read-only', async () => {
    open();

    expect(await screen.findByText('Review the images branch')).toBeDefined();
    expect(await screen.findByText('good')).toBeDefined();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('names the subagent, its kind and its parent in the top bar', async () => {
    open();

    const banner = await screen.findByRole('banner');
    expect(await within(banner).findByText('Review the diff')).toBeDefined();
    expect(screen.getByText('Subagent of kirk · general-purpose')).toBeDefined();
  });

  it("leads back to the parent's conversation", async () => {
    open();

    await userEvent.click(await screen.findByRole('button', { name: 'Back to kirk' }));

    expect(await screen.findByRole('textbox', { name: 'Message' })).toBeDefined();
  });

  it('shows what the subagent does while it runs, and its end', async () => {
    const fake = open();
    expect((await screen.findByRole('status')).textContent).toContain('Thinking…');

    act(() =>
      fake.emitSubagent('kirk', 'a1', {
        type: 'subagent',
        subagent: { ...review, running: false },
      }),
    );

    expect(await screen.findByText('Ended')).toBeDefined();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('adds entries from the live stream', async () => {
    const fake = open();
    await screen.findByText('Review the images branch');

    act(() =>
      fake.emitSubagent('kirk', 'a1', {
        type: 'entries',
        reset: false,
        entries: [{ type: 'assistant', id: 'sa2', at: 3, text: 'One more thing.' }],
        activity: 'Thinking…',
      }),
    );

    expect(await screen.findByText('One more thing.')).toBeDefined();
  });

  it('names the parent as its row does', async () => {
    const fake = fakeClient({
      agents: new Map([
        ['w4:p1', fakeAgent({ ref: 'w4:p1', name: undefined, workspace: 'notes' })],
      ]),
      subagents: new Map([['w4:p1/a1', review]]),
    });
    renderApp({ client: fake.client, path: '/agents/w4%3Ap1/subagents/a1' });

    expect(await screen.findByText('Subagent of notes · general-purpose')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Back to notes' })).toBeDefined();
  });

  it('says so for a subagent that does not exist', async () => {
    open('/agents/kirk/subagents/b2');

    expect(await screen.findByText('This subagent was not found.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Back to kirk' })).toBeDefined();
  });
});
