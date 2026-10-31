import styles from './Segmented.module.css';

export type SegmentedProps = {
  /** Names the group for a screen reader, such as "View". */
  readonly label: string;
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  /** The value of the option that is on. */
  readonly value: string;
  readonly onChange: (value: string) => void;
};

/** A small switch between a few views, such as Chat and Screen: one pressed button at a time. */
export const Segmented = ({ label, options, value, onChange }: SegmentedProps) => (
  <div role="group" aria-label={label} className={styles.group}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className={styles.option}
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);
