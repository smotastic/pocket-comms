import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { BackgroundStrip, type BackgroundStripProps } from './BackgroundStrip.js';

afterEach(cleanup);

type Item = BackgroundStripProps['items'][number];
const command: Item = { id: 't1', kind: 'Command', description: 'Wait for CI', since: '12m' };
const subagent: Item = {
  id: 't2',
  kind: 'Subagent',
  description: 'Review the diff',
  since: '3m',
  href: '/agents/kirk/subagents/a1',
  onNavigate: vi.fn(),
};
const items = [command, subagent];

const strip = (props: Partial<BackgroundStripProps> = {}) =>
  render(<BackgroundStrip items={items} expanded={false} onToggle={() => undefined} {...props} />);

describe('BackgroundStrip', () => {
  it('reads as the number of running items while collapsed', () => {
    strip();
    const toggle = screen.getByRole('button', { name: '2 running in the background' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Wait for CI')).toBeNull();
  });

  it('toggles on a tap', () => {
    const onToggle = vi.fn();
    strip({ onToggle });
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('lists each item with its kind, description and running time when expanded', () => {
    strip({ expanded: true });
    const list = screen.getByRole('region', { name: '2 running in the background' });
    expect(list.textContent).toContain('Command');
    expect(list.textContent).toContain('Wait for CI');
    expect(list.textContent).toContain('12m');
  });

  it('opens an item that has a page, and only that one', () => {
    const onNavigate = vi.fn();
    strip({ expanded: true, items: [command, { ...subagent, onNavigate }] });
    expect(screen.getAllByRole('link')).toHaveLength(1);
    const link = screen.getByRole('link', { name: 'Subagent Review the diff 3m' });

    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('names a single item in the singular', () => {
    strip({ items: [command] });
    expect(screen.getByRole('button', { name: '1 running in the background' })).toBeDefined();
  });

  it('has no accessibility violations when expanded', async () => {
    const { container } = strip({ expanded: true });
    expect(await axeViolations(container)).toEqual([]);
  });
});
