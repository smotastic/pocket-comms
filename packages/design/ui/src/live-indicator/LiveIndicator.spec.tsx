import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { LiveIndicator } from './LiveIndicator.js';
import styles from './LiveIndicator.module.css';

afterEach(cleanup);

describe('LiveIndicator', () => {
  it('is a status that reads its label', () => {
    render(<LiveIndicator live label="Mac mini · live" />);
    expect(screen.getByRole('status').textContent).toBe('Mac mini · live');
  });

  it('lights its dot only while live', () => {
    const { rerender } = render(<LiveIndicator live label="live" />);
    expect(styles.live).toMatch(/\w/);
    expect(screen.getByRole('status').classList).toContain(styles.live);
    rerender(<LiveIndicator live={false} label="Reconnecting…" />);
    expect(screen.getByRole('status').classList).not.toContain(styles.live);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<LiveIndicator live label="live" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
