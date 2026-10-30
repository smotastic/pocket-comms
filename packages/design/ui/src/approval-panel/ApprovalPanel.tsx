import { useId, type ReactNode } from 'react';
import styles from './ApprovalPanel.module.css';

export type ApprovalPanelProps = {
  /** What is asked, such as "Claude asks to run"; it names the panel. */
  readonly title: string;
  /** What the reader decides on, such as the agent's screen. */
  readonly children: ReactNode;
};

/** A panel that stands out because something waits for the reader's answer. */
export const ApprovalPanel = ({ title, children }: ApprovalPanelProps) => {
  const id = useId();
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      {children}
    </section>
  );
};
