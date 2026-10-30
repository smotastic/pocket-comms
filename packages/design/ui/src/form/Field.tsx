import { useId, type ReactNode } from 'react';
import styles from './Field.module.css';

/** What a field hands its control, so the label and the error text belong to it. */
export type FieldControlProps = {
  readonly id: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: true;
};

export type FieldProps = {
  readonly label: string;
  /** Hides the label visually; it stays the control's accessible name. */
  readonly hideLabel?: boolean;
  /** Marks the control invalid and describes it with this text. */
  readonly error?: string;
  /** `full` takes a whole row of a multi-column form. Default `auto`. */
  readonly span?: 'auto' | 'full';
  readonly children: (control: FieldControlProps) => ReactNode;
};

/** A label, a control and its error text. */
export const Field = ({ label, hideLabel = false, error, span = 'auto', children }: FieldProps) => {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={span === 'full' ? `${styles.field} ${styles.full}` : styles.field}>
      <label htmlFor={id} className={hideLabel ? styles.visuallyHidden : styles.label}>
        {label}
      </label>
      {children(
        error === undefined ? { id } : { id, 'aria-describedby': errorId, 'aria-invalid': true },
      )}
      {error === undefined ? null : (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
};
