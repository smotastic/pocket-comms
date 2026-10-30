import { useRef, type ReactNode } from 'react';
import { useFitVisualViewport, useFollowEnd } from './docking.js';
import styles from './Layout.module.css';

export type DockedPageProps = {
  /** Stays at the top. */
  readonly header: ReactNode;
  /** Stays at the bottom, above the on-screen keyboard. */
  readonly footer: ReactNode;
  /** Names the scrolling body, which is a region. */
  readonly label: string;
  readonly children: ReactNode;
};

/**
 * A page that fills the screen, such as a conversation: the header and the footer stay in place
 * and only the body scrolls. The body follows what is added to it while the reader is at its end,
 * and stays put once they scroll up to read.
 */
export const DockedPage = ({ header, footer, label, children }: DockedPageProps) => {
  const page = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useFitVisualViewport(page);
  useFollowEnd(body);

  return (
    <main ref={page} className={styles.docked}>
      <div className={styles.dockedHeader}>
        <div className={styles.dockedInner}>{header}</div>
      </div>
      {/* Focusable, so a keyboard can scroll it. */}
      <div ref={body} className={styles.dockedBody} role="region" aria-label={label} tabIndex={0}>
        <div className={styles.dockedInner}>{children}</div>
      </div>
      <div className={styles.dockedFooter}>
        <div className={styles.dockedInner}>{footer}</div>
      </div>
    </main>
  );
};
