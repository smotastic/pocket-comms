import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { FilterChips } from './FilterChips.js';
import styles from './FilterChips.module.css';

afterEach(cleanup);

const options = [
  { value: 'all', label: 'All' },
  { value: 'pocket-comms', label: 'pocket-comms', hue: 1 },
  { value: 'other', label: 'Other', hue: 'neutral' },
] as const;

const chips = (onChange = () => undefined) =>
  render(<FilterChips label="Project" options={options} value="all" onChange={onChange} />);

describe('FilterChips', () => {
  it('is a named group of toggle buttons, the current one pressed', () => {
    chips();
    expect(screen.getByRole('group', { name: 'Project' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'pocket-comms' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('reports the chosen value', async () => {
    const onChange = vi.fn();
    chips(onChange);
    await userEvent.click(screen.getByRole('button', { name: 'pocket-comms' }));
    expect(onChange).toHaveBeenCalledWith('pocket-comms');
  });

  it('can be used with the keyboard', async () => {
    const onChange = vi.fn();
    chips(onChange);
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('pocket-comms');
  });

  it('takes the colour of an option with a hue', () => {
    chips();
    expect(styles.hue1).toMatch(/\w/);
    expect(screen.getByRole('button', { name: 'pocket-comms' }).classList).toContain(styles.hue1);
    expect(screen.getByRole('button', { name: 'Other' }).classList).toContain(styles.hueNeutral);
  });

  it('has no accessibility violations', async () => {
    const { container } = chips();
    expect(await axeViolations(container)).toEqual([]);
  });
});
