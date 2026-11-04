import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '@smotastic/pocket-design/testing';
import { IssueEditCard, type IssueEditCardProps } from './IssueEditCard.js';

afterEach(cleanup);

const props = (overrides: Partial<IssueEditCardProps> = {}): IssueEditCardProps => ({
  project: 'pocket-comms',
  number: 11,
  url: 'http://gitea/i/11',
  title: 'Orchestrator mode',
  body: 'Control agents from the chat.',
  base: { title: 'Orchestrator', body: 'An orchestrator agent.' },
  state: { _tag: 'open' },
  onApply: () => undefined,
  onDiscard: () => undefined,
  ...overrides,
});

describe('IssueEditCard', () => {
  it('links the issue and applies the title and body as the owner edited them', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<IssueEditCard {...props({ onApply })} />);

    expect(screen.getByRole('link', { name: 'Issue #11' }).getAttribute('href')).toBe(
      'http://gitea/i/11',
    );
    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Orchestrator from chat');
    await user.click(screen.getByRole('button', { name: 'Apply edit' }));

    expect(onApply).toHaveBeenCalledWith(
      {
        title: 'Orchestrator from chat',
        body: 'Control agents from the chat.',
      },
      [],
    );
  });

  it('shows the current version only when the owner opens it, keyboard included', async () => {
    const user = userEvent.setup();
    render(<IssueEditCard {...props()} />);
    expect(screen.queryByText('An orchestrator agent.')).toBeNull();

    const toggle = screen.getByRole('button', { name: /Current version/u });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.focus();
    await user.keyboard('{Enter}');

    const current = screen.getByRole('group', { name: 'Current version' });
    expect(current.textContent).toContain('Orchestrator');
    expect(current.textContent).toContain('An orchestrator agent.');
  });

  it('discards, and turns its actions off while busy', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    const { rerender } = render(<IssueEditCard {...props({ onDiscard })} />);
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDiscard).toHaveBeenCalledOnce();

    rerender(<IssueEditCard {...props({ onDiscard, busy: true })} />);
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Apply edit' })).toHaveProperty('disabled', true);
  });

  it('announces why applying failed and stays open', () => {
    render(<IssueEditCard {...props({ error: 'Issue #11 changed since Pi read it.' })} />);
    expect(screen.getByRole('alert').textContent).toBe('Issue #11 changed since Pi read it.');
    expect(screen.getByRole('button', { name: 'Apply edit' })).toBeTruthy();
  });

  it('says that the issue was updated, or that the edit was discarded', () => {
    const { rerender } = render(
      <IssueEditCard {...props({ state: { _tag: 'updated', url: 'http://gitea/i/11' } })} />,
    );
    expect(screen.getByRole('link', { name: 'Issue #11 updated' }).getAttribute('href')).toBe(
      'http://gitea/i/11',
    );
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<IssueEditCard {...props({ state: { _tag: 'discarded' } })} />);
    expect(screen.getByText('Discarded')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('is a region named by the issue it edits', () => {
    render(<IssueEditCard {...props()} />);
    expect(screen.getByRole('region', { name: 'Proposed edit of issue #11' })).toBeTruthy();
  });

  it('has no accessibility violations, open or with the current version shown', async () => {
    const user = userEvent.setup();
    const { container } = render(<IssueEditCard {...props({ error: 'Nope.' })} />);
    expect(await axeViolations(container)).toEqual([]);
    await user.click(screen.getByRole('button', { name: /Current version/u }));
    expect(await axeViolations(container)).toEqual([]);
  });
});
