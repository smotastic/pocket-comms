import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { ProposalCard, type ProposalCardProps } from './ProposalCard.js';

afterEach(cleanup);

const props = (overrides: Partial<ProposalCardProps> = {}): ProposalCardProps => ({
  project: 'pocket-home',
  title: 'Dark mode',
  body: 'A toggle.',
  state: { _tag: 'open' },
  projects: ['pocket-comms', 'pocket-home'],
  onCreate: () => undefined,
  onDiscard: () => undefined,
  ...overrides,
});

describe('ProposalCard', () => {
  it('creates the issue as the owner edited it', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<ProposalCard {...props({ onCreate })} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), 'pocket-comms');
    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Dark mode toggle');
    await user.click(screen.getByRole('button', { name: 'Create issue' }));

    expect(onCreate).toHaveBeenCalledWith({
      project: 'pocket-comms',
      title: 'Dark mode toggle',
      body: 'A toggle.',
    });
  });

  it('discards, and turns its actions off while busy', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    const { rerender } = render(<ProposalCard {...props({ onDiscard })} />);
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDiscard).toHaveBeenCalledOnce();

    rerender(<ProposalCard {...props({ onDiscard, busy: true })} />);
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Create issue' })).toHaveProperty('disabled', true);
  });

  it('announces why a decision failed', () => {
    render(<ProposalCard {...props({ error: 'Gitea answered 500.' })} />);
    expect(screen.getByRole('alert').textContent).toBe('Gitea answered 500.');
  });

  it('links the created issue, and says when it was discarded', () => {
    const { rerender } = render(
      <ProposalCard
        {...props({ state: { _tag: 'created', number: 12, url: 'http://gitea/i/12' } })}
      />,
    );
    expect(screen.getByRole('link', { name: 'Issue #12' }).getAttribute('href')).toBe(
      'http://gitea/i/12',
    );
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<ProposalCard {...props({ state: { _tag: 'discarded' } })} />);
    expect(screen.getByText('Discarded')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('is a region named by its title', () => {
    render(<ProposalCard {...props()} />);
    expect(screen.getByRole('region', { name: 'Proposed issue: Dark mode' })).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ProposalCard {...props({ error: 'Nope.' })} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
