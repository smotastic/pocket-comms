import { useId, type ReactNode } from 'react';
import styles from './IssueCard.module.css';

export type IssueCardProps = {
  readonly number: number;
  /** Shown on at most two lines. */
  readonly title: string;
  /** The line under the title, such as the labels. */
  readonly meta?: ReactNode;
  /** At the end of the meta line, such as small buttons. */
  readonly actions?: ReactNode;
  /** A question in place of the meta line and the actions, such as a confirmation. */
  readonly question?: { readonly text: ReactNode; readonly actions: ReactNode };
};

/** One issue as a compact card: its number and title, then its labels and actions. */
export const IssueCard = ({ number, title, meta, actions, question }: IssueCardProps) => {
  const heading = useId();
  return (
    <article aria-labelledby={heading} className={styles.card}>
      <p id={heading} className={styles.heading}>
        <span className={styles.number}>#{number}</span>{' '}
        <span className={styles.title}>{title}</span>
      </p>
      {question === undefined ? (
        <div className={styles.meta}>
          <span className={styles.metaText}>{meta}</span>
          {actions === undefined ? null : <span className={styles.actions}>{actions}</span>}
        </div>
      ) : (
        <div className={styles.question}>
          <span>{question.text}</span>
          <span className={styles.actions}>{question.actions}</span>
        </div>
      )}
    </article>
  );
};
