import { Children, isValidElement, type ReactNode } from 'react';
import styles from './AgentRow.module.css';

export type AgentListProps = {
  /** Names the list for a screen reader, such as "Needs you". */
  readonly label: string;
  /** The `AgentRow`s, one item each. */
  readonly children: ReactNode;
};

/** Agent rows in one frame, divided by lines. */
export const AgentList = ({ label, children }: AgentListProps) => (
  <ul aria-label={label} className={styles.list}>
    {/* Each item takes its row's key, so a reordered list moves rows instead of rebuilding them. */}
    {Children.toArray(children).map((child, index) => (
      <li key={isValidElement(child) ? (child.key ?? index) : index}>{child}</li>
    ))}
  </ul>
);
