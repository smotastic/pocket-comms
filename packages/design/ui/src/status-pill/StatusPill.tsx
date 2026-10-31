import styles from './StatusPill.module.css';

export type StatusPillProps = {
  /** Sets the colour; `working` also pulses its dot. */
  readonly tone: 'working' | 'blocked' | 'done' | 'idle' | 'unknown';
  /** The status in words, such as "Needs you"; the colour alone never carries it. */
  readonly label: string;
};

/** A small rounded status with a coloured dot, such as an agent's state. */
export const StatusPill = ({ tone, label }: StatusPillProps) => (
  <span className={`${styles.pill} ${styles[tone]}`}>
    <span className={styles.dot} aria-hidden="true" />
    {label}
  </span>
);
