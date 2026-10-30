import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { HOLD_MS, KeyPad, type KeyPadProps } from './KeyPad.js';
import styles from './KeyPad.module.css';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const keys = [
  { value: '1', label: '1' },
  { value: 'up', label: '↑', accessibleLabel: 'Up' },
  { value: 'enter', label: 'Enter' },
] as const;
const holdKey = { value: 'ctrl+c', label: 'Ctrl-C', accessibleLabel: 'Hold to send Control C' };

const pad = (props: Partial<KeyPadProps> = {}) =>
  render(<KeyPad label="Keys" keys={keys} onKey={() => undefined} holdKey={holdKey} {...props} />);

const hold = () => screen.getByRole('button', { name: 'Hold to send Control C' });

describe('KeyPad', () => {
  it('is a named group of key buttons', () => {
    pad();
    expect(screen.getByRole('group', { name: 'Keys' })).toBeDefined();
    expect(screen.getByRole('button', { name: '1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Up' }).textContent).toBe('↑');
    expect(hold().classList).toContain(styles.danger);
  });

  it('sends a key on a click', async () => {
    const onKey = vi.fn();
    pad({ onKey });
    await userEvent.click(screen.getByRole('button', { name: 'Up' }));
    expect(onKey).toHaveBeenCalledWith('up');
  });

  it('sends a key from the keyboard', async () => {
    const onKey = vi.fn();
    pad({ onKey });
    screen.getByRole('button', { name: 'Enter' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onKey).toHaveBeenCalledWith('enter');
  });

  it('sends the hold key only after a long press', () => {
    vi.useFakeTimers();
    const onKey = vi.fn();
    pad({ onKey });
    fireEvent.pointerDown(hold());
    act(() => vi.advanceTimersByTime(HOLD_MS - 1));
    expect(onKey).not.toHaveBeenCalled();
    expect(hold().classList).toContain(styles.holding);
    act(() => vi.advanceTimersByTime(1));
    expect(onKey).toHaveBeenCalledExactlyOnceWith('ctrl+c');
    expect(hold().classList).not.toContain(styles.holding);
  });

  it.each(['pointerUp', 'pointerLeave', 'pointerCancel'] as const)(
    'sends nothing when the press ends early with %s',
    (end) => {
      vi.useFakeTimers();
      const onKey = vi.fn();
      pad({ onKey });
      fireEvent.pointerDown(hold());
      act(() => vi.advanceTimersByTime(HOLD_MS / 2));
      fireEvent[end](hold());
      fireEvent.click(hold());
      act(() => vi.advanceTimersByTime(HOLD_MS));
      expect(onKey).not.toHaveBeenCalled();
      expect(hold().classList).not.toContain(styles.holding);
    },
  );

  it('sends the hold key when Enter or Space is held long enough', () => {
    vi.useFakeTimers();
    const onKey = vi.fn();
    pad({ onKey });
    fireEvent.keyDown(hold(), { key: ' ' });
    fireEvent.keyDown(hold(), { key: ' ', repeat: true });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(onKey).toHaveBeenCalledExactlyOnceWith('ctrl+c');
  });

  it('sends nothing when the key is let go early', () => {
    vi.useFakeTimers();
    const onKey = vi.fn();
    pad({ onKey });
    fireEvent.keyDown(hold(), { key: 'Enter' });
    fireEvent.keyUp(hold(), { key: 'Enter' });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(onKey).not.toHaveBeenCalled();
  });

  it('drops a press that is under way when the pad is disabled', () => {
    vi.useFakeTimers();
    const onKey = vi.fn();
    const { rerender } = pad({ onKey });
    fireEvent.pointerDown(hold());
    rerender(<KeyPad label="Keys" keys={keys} onKey={onKey} holdKey={holdKey} disabled />);
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(onKey).not.toHaveBeenCalled();
    expect(hold().classList).not.toContain(styles.holding);
  });

  it('sends nothing while disabled', async () => {
    const onKey = vi.fn();
    pad({ onKey, disabled: true });
    await userEvent.click(screen.getByRole('button', { name: '1' }));
    expect(onKey).not.toHaveBeenCalled();
    expect(hold().hasAttribute('disabled')).toBe(true);
  });

  it('fills in the same time as the press takes', () => {
    const css = readFileSync(
      join(import.meta.dirname, '../../../tokens/src/generated/tokens.css'),
      'utf8',
    );
    expect(css).toContain(`--motion-duration-hold: ${HOLD_MS}ms;`);
  });

  it('shows no fill animation when the user asks for reduced motion', () => {
    const css = readFileSync(join(import.meta.dirname, 'KeyPad.module.css'), 'utf8');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{\s*\.holding \.fill\s*{\s*transition: none;/,
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = pad();
    expect(await axeViolations(container)).toEqual([]);
  });
});
