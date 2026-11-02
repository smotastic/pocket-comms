import type { Hue } from '../hue.js';
import styles from './FilterChips.module.css';

const HUE_CLASSES: Record<Hue, string | undefined> = {
  1: styles.hue1,
  2: styles.hue2,
  3: styles.hue3,
  4: styles.hue4,
  5: styles.hue5,
  neutral: styles.hueNeutral,
};

export type FilterChipsProps = {
  /** Names the group for a screen reader, such as "Project". */
  readonly label: string;
  /** An option with a hue shows in that colour, such as a project's. */
  readonly options: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
    readonly hue?: Hue;
  }>;
  /** The value of the option that is on. */
  readonly value: string;
  readonly onChange: (value: string) => void;
};

/** A row of pill buttons that narrows a list, one pressed at a time; it wraps when it is long. */
export const FilterChips = ({ label, options, value, onChange }: FilterChipsProps) => (
  <div role="group" aria-label={label} className={styles.group}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className={[styles.chip, option.hue === undefined ? '' : HUE_CLASSES[option.hue]]
          .filter(Boolean)
          .join(' ')}
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);
