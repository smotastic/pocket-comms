import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Card } from './Card.js';
import styles from './Card.module.css';

afterEach(cleanup);

describe('Card', () => {
  it('shows its content on a surface with padding by default', () => {
    render(<Card>Content</Card>);
    const card = screen.getByText('Content');
    expect(styles.padded).toMatch(/\w/);
    expect(card.classList).toContain(styles.card);
    expect(card.classList).toContain(styles.padded);
  });

  it('can leave the padding to its content', () => {
    render(<Card padding="none">Content</Card>);
    expect(styles.padded).toMatch(/\w/);
    expect(screen.getByText('Content').classList).not.toContain(styles.padded);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Card>Content</Card>);
    expect(await axeViolations(container)).toEqual([]);
  });
});
