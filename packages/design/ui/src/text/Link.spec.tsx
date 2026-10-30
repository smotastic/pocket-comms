import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Link } from './Link.js';
import styles from './Link.module.css';

afterEach(cleanup);

describe('Link', () => {
  it('is a link named by its content', () => {
    render(<Link href="https://effect.website">Effect</Link>);
    const link = screen.getByRole('link', { name: 'Effect' });
    expect(link.getAttribute('href')).toBe('https://effect.website');
    expect(link.getAttribute('target')).toBeNull();
  });

  it('opens an external link in a new tab without handing it the opener', () => {
    render(
      <Link href="https://effect.website" external>
        Effect
      </Link>,
    );
    const link = screen.getByRole('link', { name: 'Effect' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
  });

  it('is reached with Tab and followed with Enter', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <Link href="#top" onClick={onClick}>
        Top
      </Link>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link'));
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('can stand out as the title of an item', () => {
    render(
      <Link href="#a" emphasis="strong">
        Effect
      </Link>,
    );
    expect(styles.strong).toMatch(/\w/);
    expect(screen.getByRole('link').classList).toContain(styles.strong);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Link href="https://effect.website" external>
        Effect
      </Link>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
