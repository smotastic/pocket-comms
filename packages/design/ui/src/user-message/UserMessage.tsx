import type { ReactNode } from 'react';
import styles from './UserMessage.module.css';

export type UserMessageProps = {
  /** Who wrote it. Default "You". */
  readonly label?: string;
  /** The message as written; its line breaks are kept. */
  readonly children: ReactNode;
};

/** The reader's own message in a conversation: a card with a small "You" label. */
export const UserMessage = ({ label = 'You', children }: UserMessageProps) => (
  <div className={styles.message}>
    <div className={styles.label}>{label}</div>
    <div className={styles.text}>{children}</div>
  </div>
);
