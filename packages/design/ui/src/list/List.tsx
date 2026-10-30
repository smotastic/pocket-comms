import { Children, type ComponentPropsWithRef, type ReactNode } from 'react';
import styles from './List.module.css';

export type ListProps = Omit<ComponentPropsWithRef<'ul'>, 'className' | 'style'> & {
  /** Shown as the only item while the list has none; `null`, `false` and empty arrays are none. */
  readonly empty?: ReactNode;
};

/** A list of items separated by dividers. */
export const List = ({ empty, children, ...props }: ListProps) => (
  <ul {...props} className={styles.list}>
    {Children.toArray(children).length === 0 && empty !== undefined ? (
      <li className={styles.empty}>{empty}</li>
    ) : (
      children
    )}
  </ul>
);

export type ListItemProps = {
  /** Buttons at the end of the row. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
};

/** One row of a list: its content, and its actions at the end. */
export const ListItem = ({ actions, children }: ListItemProps) => (
  <li className={styles.item}>
    <div className={styles.content}>{children}</div>
    {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
  </li>
);
