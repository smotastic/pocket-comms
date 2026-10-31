import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Select } from './Select.js';

afterEach(cleanup);

const options = [
  { value: 'pocket-comms', label: 'pocket-comms · open' },
  { value: 'pocket-home', label: 'pocket-home' },
];

describe('Select', () => {
  it('is a combo box named by its label, with its options', () => {
    render(<Select label="Project" options={options} />);
    const select = screen.getByRole('combobox', { name: 'Project' });
    expect(
      [...(select as HTMLSelectElement).options].map((option) => [option.value, option.text]),
    ).toEqual([
      ['pocket-comms', 'pocket-comms · open'],
      ['pocket-home', 'pocket-home'],
    ]);
  });

  it('is reached with Tab and reports the chosen option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        label="Project"
        options={options}
        onChange={(event) => onChange(event.target.value)}
      />,
    );
    await user.tab();
    const select = screen.getByRole('combobox', { name: 'Project' });
    expect(document.activeElement).toBe(select);
    await user.selectOptions(select, 'pocket-home');
    expect(onChange).toHaveBeenCalledWith('pocket-home');
  });

  it('marks itself invalid and is described by its error', () => {
    render(<Select label="Project" options={options} error="Pick a project." />);
    const select = screen.getByRole('combobox', { name: 'Project' });
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(
      document.getElementById(select.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Pick a project.');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <>
        <Select label="Project" options={options} />
        <Select label="Kind" hideLabel options={options} error="Pick one." />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
