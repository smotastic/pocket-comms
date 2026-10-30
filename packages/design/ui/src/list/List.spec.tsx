import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '../button/Button.js';
import { axeViolations } from '../testing/a11y.js';
import { List, ListItem } from './List.js';

afterEach(cleanup);

describe('List', () => {
  it('is a list of its items', () => {
    render(
      <List aria-label="Bookmarks">
        <ListItem>Effect docs</ListItem>
        <ListItem>Nx docs</ListItem>
      </List>,
    );
    const list = screen.getByRole('list', { name: 'Bookmarks' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Effect docs', 'Nx docs']);
  });

  it('shows its empty state when it has no items', () => {
    render(<List empty="No bookmarks yet.">{[]}</List>);
    expect(screen.getByRole('listitem').textContent).toBe('No bookmarks yet.');
  });

  it.each([
    ['false', false],
    ['null', null],
    ['a list of nothing', [null, false]],
  ])('shows its empty state for %s', (_, children) => {
    render(<List empty="No bookmarks yet.">{children}</List>);
    expect(screen.getByRole('listitem').textContent).toBe('No bookmarks yet.');
  });

  it('hides the empty state while it has items', () => {
    render(
      <List empty="No bookmarks yet.">
        <ListItem>Effect docs</ListItem>
      </List>,
    );
    expect(screen.queryByText('No bookmarks yet.')).toBeNull();
  });

  it('shows the actions of an item next to its content', () => {
    render(
      <List>
        <ListItem actions={<Button size="sm">Archive</Button>}>Effect docs</ListItem>
      </List>,
    );
    const item = screen.getByRole('listitem');
    expect(within(item).getByRole('button', { name: 'Archive' })).toBeDefined();
    expect(within(item).getByText('Effect docs')).toBeDefined();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <List aria-label="Bookmarks" empty="No bookmarks yet.">
        <ListItem actions={<Button size="sm">Archive</Button>}>Effect docs</ListItem>
      </List>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
