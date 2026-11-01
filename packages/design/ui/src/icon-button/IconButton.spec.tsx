import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { ICON_NAMES } from './Icon.js';
import { IconButton } from './IconButton.js';
import styles from './IconButton.module.css';

afterEach(cleanup);

// An icon alone says nothing to a screen reader, so a button without a name must not compile.
// @ts-expect-error -- `label` is required.
const _unnamed = () => <IconButton icon="close" />;

describe('IconButton', () => {
  it('is a button named by its label, with the icon hidden', () => {
    render(<IconButton icon="history" label="History" />);
    const button = screen.getByRole('button', { name: 'History' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(button.classList).toContain(styles.quiet);
  });

  it('is pressed with Enter and Space after a Tab', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon="plus" label="New chat" onClick={onClick} />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New chat' }));
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('tells a screen reader whether a toggle is on', () => {
    render(
      <>
        <IconButton icon="history" label="History" pressed />
        <IconButton icon="expand" label="Expand" />
      </>,
    );
    expect(
      screen.getByRole('button', { name: 'History', pressed: true }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Expand' }).hasAttribute('aria-pressed')).toBe(false);
  });

  it('shows a mark, such as a filter that is on, without changing its name', () => {
    render(
      <>
        <IconButton icon="menu" label="Filter by project" marked />
        <IconButton icon="plus" label="New task" />
      </>,
    );
    const marked = screen.getByRole('button', { name: 'Filter by project' });
    expect(marked.querySelector(`.${styles.mark}`)?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: 'New task' }).querySelector(`.${styles.mark}`)).toBe(
      null,
    );
  });

  it('is round and in the accent for the primary action, and can be disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon="send" label="Send" tone="primary" disabled onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button.classList).toContain(styles.primary);
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('draws every icon of the set', () => {
    render(
      <>
        {ICON_NAMES.map((name) => (
          <IconButton key={name} icon={name} label={name} />
        ))}
      </>,
    );
    expect(ICON_NAMES).toEqual([
      'history',
      'plus',
      'expand',
      'close',
      'send',
      'back',
      'issues',
      'menu',
    ]);
    for (const name of ICON_NAMES) {
      const path = screen.getByRole('button', { name }).querySelector('path');
      expect(path?.getAttribute('d')).toMatch(/^M/);
    }
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <>
        <IconButton icon="history" label="History" pressed={false} />
        <IconButton icon="send" label="Send" tone="primary" disabled />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
