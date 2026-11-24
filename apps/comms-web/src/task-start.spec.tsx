import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '@smotastic/pocket-design/testing';
import { RequestError, type ConversationView, type TaskStartView } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

const start = (overrides: Partial<TaskStartView> = {}): TaskStartView => ({
  source: 'kept',
  delivery: 'not-sent',
  reason: 'The agent waits for an answer, so the task was not sent.',
  prompt: 'Fix the login\n\nCloses #12',
  branch: 'fix/12-login',
  issue: 12,
  agent: { status: 'idle', ready: true },
  ...overrides,
});

const open = (kept: TaskStartView | undefined, path = '/agents/kirk') => {
  const fake = fakeClient({
    agents: new Map([['kirk', fakeAgent()]]),
    conversations: new Map<string, ConversationView>([['kirk', { entries: [], currentStep: '' }]]),
  });
  if (kept !== undefined) fake.state.taskStarts.set('kirk', kept);
  return { ...fake, ...renderApp({ client: fake.client, path }) };
};

const card = (name: string | RegExp) => screen.findByRole('region', { name });

describe('the Task not sent card', () => {
  it('shows the kept prompt with the reason, and sends the edited prompt once', async () => {
    const user = userEvent.setup();
    const { calls } = open(start());

    const region = await card('The task was not sent');
    expect(within(region).getByText('fix/12-login · issue #12')).toBeDefined();
    expect(within(region).getByText(/waits for an answer/u)).toBeDefined();
    const field = within(region).getByRole('textbox', { name: 'Task' });
    expect((field as HTMLTextAreaElement).value).toBe('Fix the login\n\nCloses #12');
    expect(await axeViolations(document.body)).toEqual([]);

    await user.type(field, ' now');
    await user.click(within(region).getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'The task was not sent' })).toBeNull(),
    );
    expect(calls.taskStartSends).toEqual([['kirk', { prompt: 'Fix the login\n\nCloses #12 now' }]]);
  });

  it('keeps the task while the agent waits for an answer, and offers no Send', async () => {
    open(start({ agent: { status: 'blocked', ready: false } }));

    const region = await card('The task was not sent');
    expect(within(region).getByText(/Answer the agent’s question first/u)).toBeDefined();
    expect(within(region).getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('sends an uncertain task only through Send anyway', async () => {
    const user = userEvent.setup();
    const { calls } = open(start({ delivery: 'uncertain', reason: undefined }));

    const region = await card('The task may not have arrived');
    expect(within(region).getByText(/Check the conversation/u)).toBeDefined();
    expect(within(region).queryByRole('button', { name: 'Send' })).toBeNull();
    await user.click(within(region).getByRole('button', { name: 'Send anyway' }));

    await waitFor(() => expect(calls.taskStartSends).toHaveLength(1));
    expect(calls.taskStartSends[0]?.[1]).toMatchObject({ anyway: true });
  });

  it('dismisses the task only after a confirmation, sending nothing', async () => {
    const user = userEvent.setup();
    const { calls } = open(start());

    const region = await card('The task was not sent');
    await user.click(within(region).getByRole('button', { name: 'Dismiss' }));
    expect(calls.dismissedTaskStarts).toEqual([]);
    await user.click(within(region).getByRole('button', { name: 'Dismiss the task' }));

    await waitFor(() => expect(calls.dismissedTaskStarts).toEqual(['kirk']));
    expect(calls.taskStartSends).toEqual([]);
  });

  it('says why a send did not arrive, and keeps the task', async () => {
    const user = userEvent.setup();
    const fake = open(start());
    fake.state.taskStartSent = new RequestError('kirk waits for an answer.', 409);

    const region = await card('The task was not sent');
    await user.click(within(region).getByRole('button', { name: 'Send' }));

    expect(await within(region).findByText('kirk waits for an answer.')).toBeDefined();
  });

  it('shows Starting the agent… without actions while the start runs', async () => {
    open(start({ delivery: 'pending', reason: undefined }));

    const region = await card('Starting the agent…');
    expect(within(region).queryByRole('button')).toBeNull();
  });

  it("offers the issue's task from Send the issue's task…, only anyway", async () => {
    const user = userEvent.setup();
    const fake = open(undefined, '/agents/kirk?task=issue');
    fake.state.taskStarts.set('kirk?issue', start({ source: 'issue', delivery: 'uncertain' }));

    const region = await card('Send the issue’s task');
    expect(within(region).getByText(/Prompt built from the issue/u)).toBeDefined();
    expect(within(region).queryByRole('button', { name: 'Dismiss' })).toBeNull();
    await user.click(within(region).getByRole('button', { name: 'Send anyway' }));

    await waitFor(() =>
      expect(fake.calls.taskStartSends[0]?.[1]).toMatchObject({ anyway: true, fromIssue: true }),
    );
  });

  it('shows no card when nothing needs recovering', async () => {
    open(undefined);

    expect(await screen.findByRole('textbox', { name: 'Message' })).toBeDefined();
    expect(screen.queryByRole('region', { name: /task/u })).toBeNull();
  });
});
