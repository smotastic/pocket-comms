import styles from './LiveIndicator.module.css';

export type LiveIndicatorProps = {
  /** Whether live updates are arriving; the dot lights up while they are. */
  readonly live: boolean;
  /** Says it in words, such as "Mac mini · live" or "Reconnecting…". A change is announced. */
  readonly label: string;
};

/** Shows whether a live connection is up: a dot and a label, read as a status. */
export const LiveIndicator = ({ live, label }: LiveIndicatorProps) => (
  <span role="status" className={live ? `${styles.indicator} ${styles.live}` : styles.indicator}>
    <span className={styles.dot} aria-hidden="true" />
    {label}
  </span>
);
