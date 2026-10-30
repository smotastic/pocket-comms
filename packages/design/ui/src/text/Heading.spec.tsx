import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Heading } from './Heading.js';
import styles from './Heading.module.css';

afterEach(cleanup);

describe('Heading', () => {
  it.each([1, 2, 3] as const)('is a heading of level %i', (level) => {
    render(<Heading level={level}>Bookmarks</Heading>);
    const heading = screen.getByRole('heading', { level, name: 'Bookmarks' });
    expect(heading.tagName).toBe(`H${level}`);
    expect(styles[`level${level}`]).toMatch(/\w/);
    expect(heading.classList).toContain(styles[`level${level}`]);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Heading level={1}>Bookmarks</Heading>);
    expect(await axeViolations(container)).toEqual([]);
  });
});
