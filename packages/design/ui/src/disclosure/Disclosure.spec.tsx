import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Disclosure, type DisclosureProps } from './Disclosure.js';
import styles from './Disclosure.module.css';

afterEach(cleanup);

const Toggled = (props: Partial<DisclosureProps>) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <Disclosure
      title="pocket-comms"
      detail="3 agents · 2 issues"
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      {...props}
    >
      <p>The issues</p>
    </Disclosure>
  );
};

describe('Disclosure', () => {
  it('is a collapsed button named by its title and detail', () => {
    render(<Toggled />);
    const button = screen.getByRole('button', { name: 'pocket-comms 3 agents · 2 issues' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('The issues')).toBeNull();
  });

  it('shows its panel below it while expanded, named by its title', async () => {
    render(<Toggled />);
    const button = screen.getByRole('button', { name: /pocket-comms/ });
    await userEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('region', { name: 'pocket-comms' });
    expect(button.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.textContent).toBe('The issues');
    await userEvent.click(button);
    expect(screen.queryByRole('region', { name: 'pocket-comms' })).toBeNull();
  });

  it('can be used with the keyboard', async () => {
    render(<Toggled />);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('The issues')).toBeDefined();
  });

  it('takes the colour of its hue', () => {
    const { container } = render(<Toggled hue={2} />);
    expect(styles.hue2).toMatch(/\w/);
    expect(container.firstElementChild?.classList).toContain(styles.hue2);
  });

  it('has no accessibility violations, open or closed', async () => {
    const { container } = render(<Toggled />);
    expect(await axeViolations(container)).toEqual([]);
    await userEvent.click(screen.getByRole('button'));
    expect(await axeViolations(container)).toEqual([]);
  });
});
