import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tag } from '../tag/Tag.js';
import { axeViolations } from '../testing/a11y.js';
import { Composer, type ComposerProps } from './Composer.js';
import styles from './Composer.module.css';

afterEach(cleanup);

// A text box without a name must not compile.
// @ts-expect-error -- `label` is required.
const _unlabeled = () => <Composer value="" onChange={() => undefined} onSend={() => undefined} />;

/** A composer that keeps its own text and clears it once sent, as a screen would. */
const Controlled = ({
  initial = '',
  onSend,
  ...props
}: Partial<Omit<ComposerProps, 'value' | 'onChange'>> & { readonly initial?: string }) => {
  const [text, setText] = useState(initial);
  return (
    <Composer
      label="Message"
      value={text}
      onChange={setText}
      onSend={(sent) => {
        onSend?.(sent);
        setText('');
      }}
      {...props}
    />
  );
};

const box = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message' });
const send = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Send' });

describe('Composer', () => {
  it('starts one line high and grows with its text', async () => {
    // jsdom lays nothing out, so the text's height is what this says.
    const height = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockImplementation(function (this: HTMLTextAreaElement) {
        return 24 * (this.value.split('\n').length + 1);
      });
    render(<Controlled />);

    expect(box().rows).toBe(1);
    expect(box().style.height).toBe('48px');

    await userEvent.type(box(), 'one{Shift>}{Enter}{/Shift}two');

    expect(box().style.height).toBe('72px');
    height.mockRestore();
  });

  it('is a multi-line text box named by its label, with a round send button', () => {
    render(<Controlled />);
    expect(box().tagName).toBe('TEXTAREA');
    expect(send().closest(`.${styles.field}`)).toBe(box().closest(`.${styles.field}`));
  });

  it('sends the trimmed text with Enter and keeps Shift+Enter for a new line', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Controlled onSend={onSend} />);
    await user.click(box());
    await user.keyboard('  Tea?{Shift>}{Enter}{/Shift}Please. ');
    expect(box().value).toBe('  Tea?\nPlease. ');
    await user.keyboard('{Enter}');
    expect(onSend.mock.calls).toEqual([['Tea?\nPlease.']]);
    expect(box().value).toBe('');
  });

  it('sends with the send button', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Controlled initial="Hello" onSend={onSend} />);
    await user.click(send());
    expect(onSend).toHaveBeenCalledWith('Hello');
  });

  it('sends nothing while the text is blank', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Controlled initial="   " onSend={onSend} />);
    expect(send().disabled).toBe(true);
    await user.click(box());
    await user.keyboard('{Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(box().value).toBe('   ');
  });

  it('does not send while a word is still being composed', () => {
    const onSend = vi.fn();
    render(<Controlled initial="kanji" onSend={onSend} />);
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('lets the user write ahead but not send while locked', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Controlled locked onSend={onSend} />);
    await user.click(box());
    await user.keyboard('Next{Enter}');
    expect(box().value).toBe('Next');
    expect(send().disabled).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('takes no text while disabled', () => {
    render(<Controlled initial="Hello" disabled />);
    expect(box().disabled).toBe(true);
    expect(send().disabled).toBe(true);
  });

  it('shows the context above the text and is described by its hint', () => {
    render(
      <Controlled
        context={<Tag>notes.md</Tag>}
        hint="Files change only when you approve it."
        placeholder="Write a message…"
      />,
    );
    const chip = screen.getByText('notes.md');
    expect(chip.compareDocumentPosition(box())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(chip.closest(`.${styles.field}`)).toBe(box().closest(`.${styles.field}`));
    const hint = document.getElementById(box().getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe('Files change only when you approve it.');
    expect(box().placeholder).toBe('Write a message…');
  });

  it('takes another name for the send button', () => {
    render(<Controlled sendLabel="Ask" />);
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDefined();
  });

  it('offers an attach button that hands over the picked images', async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    render(<Controlled onAttach={onAttach} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');

    await user.upload(
      input as HTMLInputElement,
      new File(['x'], 'shot.png', { type: 'image/png' }),
    );

    expect(screen.getByRole('button', { name: 'Attach image' })).toBeDefined();
    expect(onAttach).toHaveBeenCalledOnce();
  });

  it('has no attach button unless asked, and can disable it', () => {
    const { rerender } = render(<Controlled />);
    expect(screen.queryByRole('button', { name: 'Attach image' })).toBeNull();
    rerender(<Controlled onAttach={() => undefined} attachDisabled />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Attach image' }).disabled).toBe(
      true,
    );
  });

  it('shows the attachments in the field and sends without text when sendable', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Controlled onSend={onSend} attachments={<Tag>shot.png</Tag>} sendable />);
    expect(screen.getByText('shot.png').closest(`.${styles.field}`)).toBe(
      box().closest(`.${styles.field}`),
    );

    await user.click(send());

    expect(onSend).toHaveBeenCalledWith('');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Controlled
        initial="Hello"
        context={<Tag>notes.md</Tag>}
        hint="Files change only when you approve it."
      />,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
