import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '@smotastic/pocket-design/testing';
import { HOLD_MS, KeyPad, type KeyPadProps } from './KeyPad.js';

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
// A held key shows its spinner and takes no other press until it ends.
const holding = () => hold().getAttribute('aria-disabled') === 'true';

describe('KeyPad', () => {
  it('is a named group of key buttons', () => {
    pad();
    expect(screen.getByRole('group', { name: 'Keys' })).toBeDefined();
    expect(screen.getByRole('button', { name: '1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Up' }).textContent).toBe('↑');
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
    expect(holding()).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(onKey).toHaveBeenCalledExactlyOnceWith('ctrl+c');
    expect(holding()).toBe(false);
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
      expect(holding()).toBe(false);
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
    expect(holding()).toBe(false);
  });

  it('sends nothing while disabled', async () => {
    const onKey = vi.fn();
    pad({ onKey, disabled: true });
    await userEvent.click(screen.getByRole('button', { name: '1' }));
    expect(onKey).not.toHaveBeenCalled();
    expect(hold().hasAttribute('disabled')).toBe(true);
  });

  it('has no accessibility violations', async () => {
    const { container } = pad();
    expect(await axeViolations(container)).toEqual([]);
  });
});
