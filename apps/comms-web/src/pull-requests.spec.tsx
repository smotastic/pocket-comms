import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '@smotastic/pocket-design/testing';
import {
  RequestError,
  type AttachedPullRequestView,
  type PullRequestChangesView,
} from './comms-client.js';
import { fakeAgent, fakeClient, renderApp } from './testing.js';

afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
});

const pr = (
  number: number,
  extra: Partial<AttachedPullRequestView> = {},
): AttachedPullRequestView => ({
  owner: 'smotastic',
  name: 'pocket-comms',
  number,
  url: `http://gitea.test/smotastic/pocket-comms/pulls/${number}`,
  title: `Pull request ${number}`,
  state: 'open',
  ...extra,
});

const changes = (
  number: number,
  extra: Partial<PullRequestChangesView> = {},
): PullRequestChangesView => ({
  pullRequest: pr(number),
  tooLarge: false,
  files: [
    {
      path: 'src/theme.ts',
      kind: 'modified',
      additions: 1,
      deletions: 1,
      shown: {
        kind: 'hunks',
        hunks: [
          {
            header: '@@ -1 +1 @@',
            lines: [
              { kind: 'removed', text: "export const theme = 'light';", old: 1 },
              { kind: 'added', text: "export const theme = 'dark';", new: 1 },
            ],
          },
        ],
      },
    },
    { path: 'docs/dark.png', kind: 'added', additions: 0, deletions: 0, shown: { kind: 'binary' } },
    {
      path: 'generated.ts',
      kind: 'added',
      additions: 3000,
      deletions: 0,
      shown: { kind: 'too-large' },
    },
  ],
  ...extra,
});

const open = (
  pullRequests: ReadonlyArray<AttachedPullRequestView>,
  pullRequestChanges: ReadonlyArray<[string, PullRequestChangesView | RequestError]> = [],
) => {
  const agent = fakeAgent({ status: 'idle' });
  const fake = fakeClient({
    agents: new Map([[agent.ref, agent]]),
    pullRequests: new Map([[agent.ref, [...pullRequests]]]),
    pullRequestChanges: new Map(pullRequestChanges),
  });
  return { ...fake, ...renderApp({ client: fake.client, path: `/agents/${agent.ref}` }) };
};

const banner = () => screen.findByRole('banner');

const openMore = async (name: RegExp | string = /^More/) => {
  await userEvent.click(await within(await banner()).findByRole('button', { name }));
  return screen.findByRole('dialog', { name: 'More' });
};

describe('the attached pull requests', () => {
  it('shows no count and no heading without pull requests', async () => {
    open([]);

    const more = await openMore('More');

    expect(within(more).queryByRole('heading', { name: 'Pull requests' })).toBeNull();
  });

  it('counts them on the More button and lists them first in More', async () => {
    open([pr(99), pr(7, { state: 'merged', title: 'fix: contrast' })]);

    const more = await openMore('More, 2 pull requests');

    expect(within(more).getByRole('heading', { name: 'Pull requests 2' })).toBeDefined();
    const open99 = within(more).getByRole('button', { name: /^pocket-comms #99/u });
    expect(within(open99).getByText('Pull request 99')).toBeDefined();
    expect(within(open99).getByText('open')).toBeDefined();
    const merged7 = within(more).getByRole('button', { name: /^pocket-comms #7/u });
    expect(within(merged7).getByText('fix: contrast')).toBeDefined();
    expect(within(merged7).getByText('merged')).toBeDefined();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('says why one is unavailable', async () => {
    open([
      {
        owner: 'smotastic',
        name: 'pocket-comms',
        number: 5,
        url: 'http://gitea.test/smotastic/pocket-comms/pulls/5',
        unavailable: 'Gitea cannot be reached.',
      },
    ]);

    const more = await openMore('More, 1 pull request');

    expect(within(more).getByText('Gitea cannot be reached.')).toBeDefined();
  });

  it('opens a pull request in place of More, with its files and lines', async () => {
    open([pr(99)], [['smotastic/pocket-comms#99', changes(99)]]);

    const more = await openMore();
    await userEvent.click(within(more).getByRole('button', { name: /^pocket-comms #99/u }));

    const sheet = await screen.findByRole('dialog', { name: 'smotastic/pocket-comms #99' });
    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
    expect(await within(sheet).findByText("export const theme = 'dark';")).toBeDefined();
    expect(within(sheet).getAllByText('Binary file, not shown').length).toBeGreaterThan(0);
    expect(within(sheet).getAllByText('Too large to show here').length).toBeGreaterThan(0);
    expect(within(sheet).getByRole('link', { name: 'Open in Gitea' })).toHaveProperty(
      'href',
      'http://gitea.test/smotastic/pocket-comms/pulls/99',
    );
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('says when the whole pull request is too large', async () => {
    open([pr(99)], [['smotastic/pocket-comms#99', changes(99, { tooLarge: true })]]);

    await userEvent.click(
      within(await openMore()).getByRole('button', { name: /^pocket-comms #99/u }),
    );

    expect(await screen.findByText('This pull request is too large to show here.')).toBeDefined();
  });

  it('reads the changes again on Refresh', async () => {
    const fake = open([pr(99)], [['smotastic/pocket-comms#99', changes(99)]]);
    await userEvent.click(
      within(await openMore()).getByRole('button', { name: /^pocket-comms #99/u }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'smotastic/pocket-comms #99' });
    await within(sheet).findByText("export const theme = 'dark';");

    fake.state.pullRequestChanges.set('smotastic/pocket-comms#99', {
      ...changes(99),
      pullRequest: pr(99, { state: 'merged', title: 'Pull request 99, merged' }),
      files: [
        {
          path: 'src/new.ts',
          kind: 'added',
          additions: 1,
          deletions: 0,
          shown: { kind: 'hunks', hunks: [] },
        },
      ],
    });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(within(sheet).getAllByText('src/new.ts').length).toBeGreaterThan(0));
    expect(within(sheet).getByText('merged · Pull request 99, merged')).toBeDefined();
    expect(fake.calls.changesReads).toEqual([
      'smotastic/pocket-comms#99',
      'smotastic/pocket-comms#99',
    ]);
  });

  it('shows why the changes cannot be read, and tries again', async () => {
    const fake = open(
      [pr(99)],
      [['smotastic/pocket-comms#99', new RequestError('Gitea cannot be reached.', 503)]],
    );
    await userEvent.click(
      within(await openMore()).getByRole('button', { name: /^pocket-comms #99/u }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'smotastic/pocket-comms #99' });

    expect(await within(sheet).findByText('Gitea cannot be reached.')).toBeDefined();
    fake.state.pullRequestChanges.set('smotastic/pocket-comms#99', changes(99));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Try again' }));

    expect(await within(sheet).findByText("export const theme = 'dark';")).toBeDefined();
  });

  it('removes one after the owner confirms, and Gitea is not asked to change', async () => {
    const fake = open([pr(99), pr(7)]);

    const more = await openMore('More, 2 pull requests');
    await userEvent.click(within(more).getByRole('button', { name: 'Remove pocket-comms #99' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove pocket-comms #99?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(fake.calls.removedPullRequests).toEqual([['kirk', 'smotastic/pocket-comms#99']]),
    );
    expect(
      await within(await banner()).findByRole('button', { name: 'More, 1 pull request' }),
    ).toBeDefined();
  });

  it('keeps one when the owner cancels the removal', async () => {
    const fake = open([pr(99)]);

    const more = await openMore();
    await userEvent.click(within(more).getByRole('button', { name: 'Remove pocket-comms #99' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove pocket-comms #99?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(fake.calls.removedPullRequests).toEqual([]);
  });

  it('follows an agent that attaches one while the conversation is open', async () => {
    const fake = open([]);
    await within(await banner()).findByRole('button', { name: 'More' });

    fake.state.pullRequests.set('kirk', [pr(99)]);
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(
      await within(await banner()).findByRole('button', { name: 'More, 1 pull request' }),
    ).toBeDefined();
  });

  it('names the open pull request in the address, so Back closes its sheet', async () => {
    const fake = open([pr(99)], [['smotastic/pocket-comms#99', changes(99)]]);

    await userEvent.click(
      within(await openMore()).getByRole('button', { name: /^pocket-comms #99/u }),
    );
    await screen.findByRole('dialog', { name: 'smotastic/pocket-comms #99' });
    expect(fake.router.state.location.search).toMatchObject({ pr: 'smotastic/pocket-comms/99' });

    act(() => fake.router.history.back());

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'smotastic/pocket-comms #99' })).toBeNull(),
    );
    expect(fake.router.state.location.pathname).toBe('/agents/kirk');
  });

  it('opens the pull request an address names', async () => {
    const agent = fakeAgent({ status: 'idle' });
    const fake = fakeClient({
      agents: new Map([[agent.ref, agent]]),
      pullRequests: new Map([[agent.ref, [pr(99)]]]),
      pullRequestChanges: new Map([['smotastic/pocket-comms#99', changes(99)]]),
    });
    renderApp({ client: fake.client, path: `/agents/${agent.ref}?pr=smotastic/pocket-comms/99` });

    const sheet = await screen.findByRole('dialog', { name: 'smotastic/pocket-comms #99' });
    expect(await within(sheet).findByText("export const theme = 'dark';")).toBeDefined();
  });
});
