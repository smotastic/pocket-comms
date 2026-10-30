import type { ReactNode } from 'react';
import styles from './Card.module.css';

export type CardProps = {
  /** `none` when the content brings its own spacing, such as a list. Default `md`. */
  readonly padding?: 'md' | 'none';
  readonly children: ReactNode;
};

/** A raised surface that groups related content. */
export const Card = ({ padding = 'md', children }: CardProps) => (
  <div className={padding === 'md' ? `${styles.card} ${styles.padded}` : styles.card}>
    {children}
  </div>
);
