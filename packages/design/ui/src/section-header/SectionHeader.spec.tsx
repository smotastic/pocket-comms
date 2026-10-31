import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { SectionHeader } from './SectionHeader.js';

afterEach(cleanup);

describe('SectionHeader', () => {
  it('is a level 2 heading by default', () => {
    render(<SectionHeader title="Needs you" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Needs you' })).toBeDefined();
  });

  it('can be a level 3 heading', () => {
    render(<SectionHeader title="pocket-home" level={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'pocket-home' })).toBeDefined();
  });

  it('shows the count after the title', () => {
    render(<SectionHeader title="Needs you" count={2} />);
    expect(screen.getByRole('heading').textContent).toBe('Needs you 2');
  });

  it('shows a count of zero', () => {
    render(<SectionHeader title="Idle" count={0} />);
    expect(screen.getByRole('heading').textContent).toBe('Idle 0');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<SectionHeader title="Needs you" count={1} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
