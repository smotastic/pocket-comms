import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Tag } from './Tag.js';
import styles from './Tag.module.css';

afterEach(cleanup);

describe('Tag', () => {
  it('shows its label as a tag', () => {
    render(<Tag>docs</Tag>);
    expect(styles.tag).toMatch(/\w/);
    expect(screen.getByText('docs').classList).toContain(styles.tag);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Tag>docs</Tag>);
    expect(await axeViolations(container)).toEqual([]);
  });
});
