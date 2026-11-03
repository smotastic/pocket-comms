import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/a11y.js';
import { AttachButton } from './AttachButton.js';

afterEach(cleanup);

const file = (name: string) => new File(['x'], name, { type: 'image/png' });
const picker = () => document.querySelector<HTMLInputElement>('input[type="file"]');

describe('AttachButton', () => {
  it('is a button named by its label that opens a picker for several images', async () => {
    const user = userEvent.setup();
    render(<AttachButton label="Attach image" onFiles={() => undefined} />);
    const click = vi.spyOn(picker() as HTMLInputElement, 'click');

    await user.click(screen.getByRole('button', { name: 'Attach image' }));

    expect(click).toHaveBeenCalledOnce();
    expect(picker()?.accept).toBe('image/*');
    expect(picker()?.multiple).toBe(true);
  });

  it('hands over the picked files in order', async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    render(<AttachButton label="Attach image" onFiles={onFiles} />);

    await user.upload(picker() as HTMLInputElement, [file('a.png'), file('b.png')]);

    expect(onFiles.mock.calls[0]?.[0].map((picked: File) => picked.name)).toEqual([
      'a.png',
      'b.png',
    ]);
  });

  it('cannot be used while disabled', () => {
    render(<AttachButton label="Attach image" onFiles={() => undefined} disabled />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Attach image' }).disabled).toBe(
      true,
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<AttachButton label="Attach image" onFiles={() => undefined} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
