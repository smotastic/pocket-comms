import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Activity } from './Activity.js';
import styles from './Activity.module.css';

afterEach(cleanup);

describe('Activity', () => {
  it('is a status named by its label, with the dots hidden from assistive technology', () => {
    render(<Activity label="Thinking…" />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Thinking…');
    expect(status.classList).toContain(styles.activity);
    const dots = status.querySelector(`.${styles.dots}`);
    expect(dots?.getAttribute('aria-hidden')).toBe('true');
    expect(dots?.children).toHaveLength(3);
  });

  it('announces a new label in the same status', () => {
    const { rerender } = render(<Activity label="Thinking…" />);
    rerender(<Activity label="Reading the files…" />);
    expect(screen.getByRole('status').textContent).toBe('Reading the files…');
  });

  it('stops pulsing when the user asks for reduced motion', () => {
    const css = readFileSync(join(import.meta.dirname, 'Activity.module.css'), 'utf8');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{\s*\.dot\s*{\s*animation: none;/,
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Activity label="Saving…" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
