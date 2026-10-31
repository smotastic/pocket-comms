import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { StatusPill } from './StatusPill.js';
import styles from './StatusPill.module.css';

afterEach(cleanup);

describe('StatusPill', () => {
  it('shows its label with a dot hidden from assistive technology', () => {
    render(<StatusPill tone="done" label="Done" />);
    const pill = screen.getByText('Done');
    expect(pill.textContent).toBe('Done');
    expect(pill.querySelector(`.${styles.dot}`)?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each(['working', 'blocked', 'done', 'idle', 'unknown'] as const)(
    'takes the %s tone',
    (tone) => {
      render(<StatusPill tone={tone} label={tone} />);
      expect(styles[tone]).toMatch(/\w/);
      expect(screen.getByText(tone).classList).toContain(styles[tone]);
    },
  );

  it('stops pulsing when the user asks for reduced motion', () => {
    const css = readFileSync(join(import.meta.dirname, 'StatusPill.module.css'), 'utf8');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{\s*\.working \.dot\s*{\s*animation: none;/,
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<StatusPill tone="working" label="Working" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
