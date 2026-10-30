import { Text } from '../text/Text.js';
import styles from './Activity.module.css';

export type ActivityProps = {
  /** What is under way, such as "Thinking…". A change is announced. */
  readonly label: string;
};

/** Shows that work is under way and what it is: pulsing dots and a label, read as a status. */
export const Activity = ({ label }: ActivityProps) => (
  <div role="status" className={styles.activity}>
    <span className={styles.dots} aria-hidden="true">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </span>
    <Text as="span" tone="muted">
      {label}
    </Text>
  </div>
);
