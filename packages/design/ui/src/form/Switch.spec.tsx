import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Switch } from './Switch.js';

afterEach(cleanup);

const Controlled = () => {
  const [on, setOn] = useState(true);
  return (
    <Switch
      label="Start an agent"
      description="It gets the task as its first prompt."
      checked={on}
      onChange={(event) => setOn(event.target.checked)}
    />
  );
};

describe('Switch', () => {
  it('is a switch named by its label and described by its description', () => {
    render(<Controlled />);
    const toggle = screen.getByRole('switch', { name: 'Start an agent' });
    expect((toggle as HTMLInputElement).checked).toBe(true);
    expect(
      document.getElementById(toggle.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('It gets the task as its first prompt.');
  });

  it('flips with Space and with a tap on its label', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const toggle = screen.getByRole('switch', { name: 'Start an agent' }) as HTMLInputElement;
    await user.tab();
    expect(document.activeElement).toBe(toggle);
    await user.keyboard(' ');
    expect(toggle.checked).toBe(false);
    await user.click(screen.getByText('Start an agent'));
    expect(toggle.checked).toBe(true);
  });

  it('has no description without one', () => {
    render(<Switch label="Live" />);
    expect(
      screen.getByRole('switch', { name: 'Live' }).getAttribute('aria-describedby'),
    ).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <>
        <Controlled />
        <Switch label="Live" disabled />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
