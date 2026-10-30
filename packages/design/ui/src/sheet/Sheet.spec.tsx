import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Avatar } from '../avatar/Avatar.js';
import { IconButton } from '../icon-button/IconButton.js';
import { axeViolations } from '../testing/a11y.js';
import { Sheet, type SheetProps } from './Sheet.js';
import styles from './Sheet.module.css';
import { SheetHeader } from './SheetHeader.js';
import headerStyles from './SheetHeader.module.css';

afterEach(cleanup);

/** A screen with an opener and a sheet, closed by the sheet's own Close action. */
const Screen = ({
  onClose = () => undefined,
  ...props
}: Partial<Omit<SheetProps, 'open' | 'children'>>) => {
  const [open, setOpen] = useState(false);
  const close = () => {
    onClose();
    setOpen(false);
  };
  return (
    <>
      <main>
        <button type="button" onClick={() => setOpen(true)}>
          Open Assistant
        </button>
      </main>
      <Sheet
        open={open}
        label="Assistant"
        bodyLabel="Conversation"
        onClose={close}
        header={
          <SheetHeader avatar={<Avatar initials="C" />} title="Assistant" subtitle="New chat">
            <IconButton icon="close" label="Close" onClick={close} />
          </SheetHeader>
        }
        footer={<button type="button">Send</button>}
        {...props}
      >
        <p>Hi! How can I help?</p>
      </Sheet>
    </>
  );
};

const openSheet = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Open Assistant' }));
  return screen.getByRole('dialog', { name: 'Assistant' });
};

describe('Sheet', () => {
  it('shows nothing while closed', () => {
    render(<Screen />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a modal dialog with its header, a scrolling body and its footer, in that order', async () => {
    const user = userEvent.setup();
    render(<Screen />);
    const dialog = await openSheet(user);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const body = screen.getByRole('region', { name: 'Conversation' });
    expect(body.classList).toContain(styles.body);
    expect(body.textContent).toBe('Hi! How can I help?');
    const parts = [
      screen.getByRole('heading', { name: 'Assistant' }),
      body,
      screen.getByRole('button', { name: 'Send' }),
    ];
    for (const [earlier, later] of [
      [parts[0], parts[1]],
      [parts[1], parts[2]],
    ] as const) {
      expect(earlier?.compareDocumentPosition(later as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
    expect(dialog.classList).toContain(styles.tall);
  });

  it('moves focus into the sheet and back to the opener when it closes', async () => {
    const user = userEvent.setup();
    render(<Screen />);
    const opener = screen.getByRole('button', { name: 'Open Assistant' });
    const dialog = await openSheet(user);
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Screen onClose={onClose} />);
    await openSheet(user);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes with a tap on the screen behind it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Screen onClose={onClose} />);
    const dialog = await openSheet(user);
    const scrim = dialog.parentElement?.querySelector(`.${styles.scrim}`);
    expect(scrim?.getAttribute('aria-hidden')).toBe('true');
    await user.click(scrim as Element);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the page behind from scrolling and out of reach while open', async () => {
    const user = userEvent.setup();
    document.documentElement.style.overflow = 'auto';
    render(<Screen />);
    const screenBehind = screen.getByRole('main').parentElement as HTMLElement;
    await openSheet(user);
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(screenBehind.inert).toBe(true);
    await user.keyboard('{Escape}');
    expect(document.documentElement.style.overflow).toBe('auto');
    expect(screenBehind.inert).toBe(false);
    document.documentElement.style.overflow = '';
  });

  it('fills the screen in its full size', async () => {
    const user = userEvent.setup();
    render(<Screen size="full" />);
    const dialog = await openSheet(user);
    expect(dialog.classList).toContain(styles.full);
    expect(dialog.classList).not.toContain(styles.tall);
  });

  it('follows what is added while the reader is at the end', async () => {
    const lines = (count: number) => (
      <Sheet
        open
        label="Assistant"
        bodyLabel="Conversation"
        onClose={() => undefined}
        header={<p>Head</p>}
        follow
      >
        {Array.from({ length: count }, (_, index) => (
          <p key={index}>{`Line ${index}`}</p>
        ))}
      </Sheet>
    );
    const { rerender } = render(lines(1));
    const body = screen.getByRole('region', { name: 'Conversation' });
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 300 });
    rerender(lines(2));
    await act(async () => undefined);
    expect(body.scrollTop).toBe(900);
    body.scrollTop = 100;
    fireEvent.scroll(body);
    rerender(lines(3));
    await act(async () => undefined);
    expect(body.scrollTop).toBe(100);
  });

  it('has no accessibility violations', async () => {
    const user = userEvent.setup();
    render(<Screen />);
    const dialog = await openSheet(user);
    expect(await axeViolations(dialog)).toEqual([]);
  });
});

describe('SheetHeader', () => {
  it('shows the avatar, the title as a heading, the subtitle and the actions', () => {
    render(
      <SheetHeader
        avatar={<Avatar initials="C" />}
        title="Assistant"
        subtitle="Chat · How do I rename a branch?"
      >
        <IconButton icon="history" label="History" />
        <IconButton icon="plus" label="New chat" />
        <IconButton icon="expand" label="Expand" />
        <IconButton icon="close" label="Close" />
      </SheetHeader>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Assistant' })).toBeDefined();
    expect(screen.getByText('Chat · How do I rename a branch?').classList).toContain(
      headerStyles.subtitle,
    );
    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-label')),
    ).toEqual(['History', 'New chat', 'Expand', 'Close']);
    expect(screen.getByText('C').getAttribute('aria-hidden')).toBe('true');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <SheetHeader avatar={<Avatar initials="C" />} title="Assistant">
        <IconButton icon="close" label="Close" />
      </SheetHeader>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
