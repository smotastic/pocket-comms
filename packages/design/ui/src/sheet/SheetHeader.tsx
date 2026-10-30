import type { ReactNode } from 'react';
import styles from './SheetHeader.module.css';

export type SheetHeaderProps = {
  /** A mark before the title, such as an `Avatar`. */
  readonly avatar?: ReactNode;
  /** Who or what the sheet is, such as "Assistant"; a heading. */
  readonly title: string;
  /** What the sheet shows, in one line that ends in an ellipsis when it is too long. */
  readonly subtitle?: string;
  /** Up to four `IconButton`s, such as History and Close; more do not fit a phone. */
  readonly children?: ReactNode;
};

/** The top of a sheet: a mark, a title and a subtitle, and its actions at the end. */
export const SheetHeader = ({ avatar, title, subtitle, children }: SheetHeaderProps) => (
  <div className={styles.header}>
    {avatar}
    <div className={styles.text}>
      <h2 className={styles.title}>{title}</h2>
      {subtitle === undefined ? null : <p className={styles.subtitle}>{subtitle}</p>}
    </div>
    {children === undefined ? null : <div className={styles.actions}>{children}</div>}
  </div>
);
