import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Segmented } from './Segmented.js';

afterEach(cleanup);

const options = [
  { value: 'chat', label: 'Chat' },
  { value: 'screen', label: 'Screen' },
] as const;

describe('Segmented', () => {
  it('is a named group of toggle buttons, the current one pressed', () => {
    render(<Segmented label="View" options={options} value="chat" onChange={() => undefined} />);
    expect(screen.getByRole('group', { name: 'View' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Chat' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Screen' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('reports the chosen value', async () => {
    const onChange = vi.fn();
    render(<Segmented label="View" options={options} value="chat" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Screen' }));
    expect(onChange).toHaveBeenCalledWith('screen');
  });

  it('can be used with the keyboard', async () => {
    const onChange = vi.fn();
    render(<Segmented label="View" options={options} value="chat" onChange={onChange} />);
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith('screen');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Segmented label="View" options={options} value="screen" onChange={() => undefined} />,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
