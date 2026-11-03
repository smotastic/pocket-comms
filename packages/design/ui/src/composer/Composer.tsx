import {
  useId,
  useLayoutEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { AttachButton } from '../attach-button/AttachButton.js';
import { IconButton } from '../icon-button/IconButton.js';
import hidden from '../visually-hidden.module.css';
import styles from './Composer.module.css';

export type ComposerProps = {
  /** Names the text box for a screen reader, such as "Message"; it is not shown. */
  readonly label: string;
  /** The text being written; the screen keeps it, so a draft can survive a closed sheet. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Called with the trimmed text on Enter or the send button; the screen then clears it. */
  readonly onSend: (text: string) => void;
  readonly placeholder?: string;
  /** Above the text, inside the field, such as what the message is about. */
  readonly context?: ReactNode;
  /** A line under the field that describes it. */
  readonly hint?: string;
  /** The user can write ahead but not send, such as while a reply is coming in. */
  readonly locked?: boolean;
  /** Nothing can be written or sent. */
  readonly disabled?: boolean;
  /** Names the send button. Default "Send". */
  readonly sendLabel?: string;
  /** Above the text, inside the field, such as the thumbnails of attached images. */
  readonly attachments?: ReactNode;
  /** Shows an attach button that opens the image picker; called with the picked files. */
  readonly onAttach?: (files: ReadonlyArray<File>) => void;
  /** Names the attach button. Default "Attach image". */
  readonly attachLabel?: string;
  /** The attach button is shown but cannot be used, such as when no more images fit. */
  readonly attachDisabled?: boolean;
  /** The message can be sent without text, such as when it has attached images. */
  readonly sendable?: boolean;
};

/**
 * The rounded field where a message is written, with a round send button inside it. Enter sends
 * and Shift+Enter starts a new line. The text box starts one line high, level with the buttons,
 * and grows with its text up to a limit, then scrolls.
 */
export const Composer = ({
  label,
  value,
  onChange,
  onSend,
  placeholder,
  context,
  hint,
  locked = false,
  disabled = false,
  sendLabel = 'Send',
  attachments,
  onAttach,
  attachLabel = 'Attach image',
  attachDisabled = false,
  sendable = false,
}: ComposerProps) => {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const hintId = `${id}-hint`;
  const text = value.trim();
  const canSend = !locked && !disabled && (text !== '' || sendable);

  // The box is as high as its text; the stylesheet sets the least and the most.
  useLayoutEffect(() => {
    const box = input.current;
    if (box === null) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }, [value]);

  const send = () => {
    if (canSend) onSend(text);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };
  // A word still being composed with an input method takes Enter for itself.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };

  return (
    <form className={styles.composer} onSubmit={onSubmit}>
      <div className={styles.field}>
        {context === undefined ? null : <div className={styles.context}>{context}</div>}
        {attachments === undefined ? null : <div className={styles.attachments}>{attachments}</div>}
        <div className={styles.row}>
          {onAttach === undefined ? null : (
            <AttachButton
              label={attachLabel}
              onFiles={onAttach}
              disabled={disabled || attachDisabled}
            />
          )}
          <label htmlFor={id} className={hidden.visuallyHidden}>
            {label}
          </label>
          <textarea
            ref={input}
            id={id}
            className={styles.input}
            rows={1}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            aria-describedby={hint === undefined ? undefined : hintId}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <IconButton
            icon="send"
            label={sendLabel}
            tone="primary"
            type="submit"
            disabled={!canSend}
          />
        </div>
      </div>
      {hint === undefined ? null : (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </form>
  );
};
