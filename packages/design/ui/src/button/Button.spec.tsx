import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { Button } from './Button.js';
import styles from './Button.module.css';

afterEach(cleanup);

describe('Button', () => {
  it('is a button named by its content', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
  });

  it('does not submit a form unless asked to', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('can submit a form', () => {
    render(<Button type="submit">Add</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('submit');
  });

  it('is reached with Tab and pressed with Enter and Space', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button'));
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('ignores presses while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'styles the %s variant',
    (variant) => {
      render(<Button variant={variant}>Save</Button>);
      expect(styles[variant]).toMatch(/\w/);
      expect(screen.getByRole('button').classList).toContain(styles[variant]);
    },
  );

  it('has a distinct class for every variant and size', () => {
    const names = [
      styles.primary,
      styles.secondary,
      styles.ghost,
      styles.danger,
      styles.md,
      styles.sm,
    ];
    expect(new Set(names).size).toBe(names.length);
  });

  it('is primary and medium by default', () => {
    render(<Button>Save</Button>);
    const { classList } = screen.getByRole('button');
    expect(classList).toContain(styles.primary);
    expect(classList).toContain(styles.md);
  });

  it('has a small size', () => {
    render(<Button size="sm">Archive</Button>);
    expect(screen.getByRole('button').classList).toContain(styles.sm);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Button variant="danger">Delete</Button>);
    expect(await axeViolations(container)).toEqual([]);
  });
});
