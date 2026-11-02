import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useFitVisualViewport, useFollowEnd } from '../layout/docking.js';
import styles from './Sheet.module.css';

export type SheetProps = {
  /** Whether the sheet is shown. */
  readonly open: boolean;
  /** Names the dialog, such as "Chat". */
  readonly label: string;
  /** Names the scrolling body, which is a region, such as "Conversation". */
  readonly bodyLabel: string;
  /** Called on Escape and on a tap on the screen behind; the header's Close action calls it too. */
  readonly onClose: () => void;
  /** Stays at the top, usually a `SheetHeader`. */
  readonly header: ReactNode;
  /** Stays at the bottom, above the on-screen keyboard, such as a `Composer`. */
  readonly footer?: ReactNode;
  /** `full` covers the whole screen. Default `tall`, which leaves the top of the screen in view. */
  readonly size?: 'tall' | 'full';
  /**
   * Where the sheet comes from. Default `bottom`; `end` slides in from the side at a fixed
   * width, full height, and ignores `size`.
   */
  readonly side?: 'bottom' | 'end';
  /** Keeps the end of the body in view as content is added, for a conversation. Default false. */
  readonly follow?: boolean;
  readonly children: ReactNode;
};

// Sheets can stack, and stacked sheets can close in one render in any order, so the page's scroll
// lock follows the number of open sheets: the first locks it, the last puts it back.
let openSheets = 0;
let pageOverflow = '';

const lockScroll = () => {
  const root = document.documentElement;
  if (openSheets === 0) {
    pageOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
  }
  openSheets += 1;
};

const unlockScroll = () => {
  openSheets -= 1;
  if (openSheets === 0) document.documentElement.style.overflow = pageOverflow;
};

/**
 * Makes the sheet modal while it is mounted: the page behind can neither scroll nor be reached,
 * focus moves into the sheet, and it returns to the element that had it when the sheet closes.
 */
const useModal = (
  overlay: RefObject<HTMLElement | null>,
  dialog: RefObject<HTMLElement | null>,
) => {
  useEffect(() => {
    const opener = document.activeElement;
    lockScroll();
    const behind = [...document.body.children].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== overlay.current && !element.inert,
    );
    for (const element of behind) element.inert = true;
    dialog.current?.focus();
    return () => {
      unlockScroll();
      for (const element of behind) element.inert = false;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [overlay, dialog]);
};

const OpenSheet = ({
  label,
  bodyLabel,
  onClose,
  header,
  footer,
  size = 'tall',
  side = 'bottom',
  follow = false,
  children,
}: Omit<SheetProps, 'open'>) => {
  const overlay = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useFitVisualViewport(overlay);
  useFollowEnd(body, follow);
  useModal(overlay, dialog);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    onClose();
  };

  return (
    <div
      ref={overlay}
      className={[
        styles.overlay,
        side === 'end' ? styles.overlayEnd : size === 'tall' ? styles.overlayTall : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* A second way to close for a pointer; the keyboard has Escape and the Close action. */}
      <div className={styles.scrim} aria-hidden="true" onClick={onClose} />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`${styles.sheet} ${side === 'end' ? styles.end : styles[size]}`}
        onKeyDown={onKeyDown}
      >
        {side === 'bottom' && size === 'tall' ? (
          <div className={styles.grabber} aria-hidden="true" />
        ) : null}
        <div className={styles.header}>{header}</div>
        {/* Focusable, so a keyboard can scroll it. */}
        <div ref={body} className={styles.body} role="region" aria-label={bodyLabel} tabIndex={0}>
          {children}
        </div>
        {footer === undefined ? null : <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
};

/**
 * A modal sheet that rises from the bottom over the screen, such as a chat, or slides in from the
 * side, such as a list to pick from. The header and the
 * footer stay in place and only the body scrolls; the footer stays above the on-screen keyboard.
 * The screen behind stays mounted, so closing the sheet returns to it as it was.
 */
export const Sheet = ({ open, ...props }: SheetProps) =>
  open ? createPortal(<OpenSheet {...props} />, document.body) : null;
