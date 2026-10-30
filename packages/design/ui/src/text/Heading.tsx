import type { ReactNode } from 'react';
import styles from './Heading.module.css';

export type HeadingProps = {
  /** The level in the document outline; it also sets the size. */
  readonly level: 1 | 2 | 3;
  readonly children: ReactNode;
};

/** A section heading. */
export const Heading = ({ level, children }: HeadingProps) => {
  const Tag = `h${level}` as const;
  return <Tag className={`${styles.heading} ${styles[`level${level}`]}`}>{children}</Tag>;
};
