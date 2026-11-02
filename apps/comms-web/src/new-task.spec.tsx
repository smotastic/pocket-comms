import { cleanup, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RequestError } from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(cleanup);

// New task opens from a project's page (spec 008, requirement 11).
const at = { path: '/projects/pocket-home' };

const openSheet = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'New task' }));
  return screen.findByRole('dialog', { name: 'New task' });
};

const fill = async (task: string) => {
  await userEvent.type(await screen.findByRole('textbox', { name: 'Task' }), task);
};

describe('the New task sheet', () => {
  it("names the page's project and offers no other", async () => {
    renderApp({ client: fakeClient().client, ...at });

    const sheet = await openSheet();

    expect(within(sheet).getByText('pocket-home · a new worktree in Herdr')).toBeDefined();
    expect(within(sheet).queryByRole('combobox', { name: 'Project' })).toBeNull();
  });

  it('prefills the branch from the task until it is edited', async () => {
    renderApp({ client: fakeClient().client, ...at });
    await openSheet();
    const branch = () => screen.getByRole('textbox', { name: 'Branch' }) as HTMLInputElement;

    await fill('Fix the login redirect');
    expect(branch().value).toBe('fix/the-login-redirect');

    await userEvent.clear(branch());
    await userEvent.type(branch(), 'fix/login');
    await userEvent.type(screen.getByRole('textbox', { name: 'Task' }), ' loop');
    expect(branch().value).toBe('fix/login');
  });

  it('creates the task with a Claude agent and opens its conversation', async () => {
    const agent = fakeAgent({ ref: 'feat-add-dark-mode', paneId: 'wK:p1', title: 'Add dark mode' });
    const fake = fakeClient({
      agents: new Map([[agent.ref, agent]]),
      created: {
        workspace: 'wK',
        branch: 'feat/add-dark-mode',
        path: '/worktrees/feat-add-dark-mode',
        agent: { ref: 'feat-add-dark-mode', started: true, prompted: true },
      },
    });
    const { router } = renderApp({ client: fake.client, ...at });
    await openSheet();

    await fill('Add dark mode');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(fake.calls.tasks).toEqual([
      {
        project: 'pocket-home',
        task: 'Add dark mode',
        branch: 'feat/add-dark-mode',
        agent: { kind: 'claude' },
      },
    ]);
    await screen.findByRole('heading', { name: 'feat-add-dark-mode' });
    expect(router.state.location.pathname).toBe('/agents/feat-add-dark-mode');
  });

  it('shows the note of an agent that did not get the task', async () => {
    const agent = fakeAgent({ ref: 'feat-x', paneId: 'wK:p1', status: 'blocked' });
    const fake = fakeClient({
      agents: new Map([[agent.ref, agent]]),
      created: {
        workspace: 'wK',
        branch: 'feat/x',
        path: '/worktrees/feat-x',
        agent: {
          ref: 'feat-x',
          started: true,
          prompted: false,
          note: 'The agent waits for an answer, so the task was not sent.',
        },
      },
    });
    renderApp({ client: fake.client, ...at });
    await openSheet();

    await fill('X');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect((await screen.findByRole('status')).textContent).toBe(
      'The agent waits for an answer, so the task was not sent.',
    );
  });

  it('starts a Pi agent when chosen', async () => {
    const fake = fakeClient();
    renderApp({ client: fake.client, ...at });
    await openSheet();

    await fill('Add dark mode');
    await userEvent.click(screen.getByRole('button', { name: 'Pi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(fake.calls.tasks[0]?.agent).toEqual({ kind: 'pi' });
  });

  it('creates only the worktree without an agent and says so on the project page', async () => {
    const fake = fakeClient();
    const { router } = renderApp({ client: fake.client, ...at });
    await openSheet();

    await fill('Add dark mode');
    await userEvent.click(screen.getByRole('switch', { name: 'Start an agent' }));
    expect(screen.queryByRole('group', { name: 'Agent' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(fake.calls.tasks).toEqual([
      { project: 'pocket-home', task: 'Add dark mode', branch: 'feat/add-dark-mode' },
    ]);
    expect(
      (await screen.findByText('feat/x is ready in a new worktree.')).closest('[role="status"]'),
    ).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/projects/pocket-home');
  });

  it('shows a refused field at the field and keeps what was typed', async () => {
    const fake = fakeClient({
      created: new RequestError('The request is invalid', 422, [
        { field: 'branch', message: 'git does not accept feat/a.lock as a branch name.' },
      ]),
    });
    renderApp({ client: fake.client, ...at });
    await openSheet();

    await fill('Add dark mode');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    const branch = screen.getByRole('textbox', { name: 'Branch' });
    expect(await screen.findByText('git does not accept feat/a.lock as a branch name.')).toBe(
      document.getElementById(branch.getAttribute('aria-describedby') ?? ''),
    );
    expect((screen.getByRole('textbox', { name: 'Task' }) as HTMLTextAreaElement).value).toBe(
      'Add dark mode',
    );
  });

  it('shows why a create failed', async () => {
    const fake = fakeClient({
      created: new RequestError('feat/x exists locally or on origin. Choose another name.', 409),
    });
    renderApp({ client: fake.client, ...at });
    await openSheet();

    await fill('X');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'feat/x exists locally or on origin. Choose another name.',
    );
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeDefined();
  });

  it('closes and forgets the draft', async () => {
    renderApp({ client: fakeClient().client, ...at });
    await openSheet();
    await fill('Draft');

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await openSheet();
    expect(
      ((await screen.findByRole('textbox', { name: 'Task' })) as HTMLTextAreaElement).value,
    ).toBe('');
  });
});
