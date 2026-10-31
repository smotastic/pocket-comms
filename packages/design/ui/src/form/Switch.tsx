import { useId, type ComponentPropsWithRef } from 'react';
import styles from './Switch.module.css';

export type SwitchProps = Omit<
  ComponentPropsWithRef<'input'>,
  'className' | 'style' | 'id' | 'type' | 'role'
> & {
  /** What the switch turns on, such as "Start an agent". */
  readonly label: string;
  /** A line under the label that says what on means. */
  readonly description?: string;
};

/** An on/off switch with its label beside it; a tap on the label flips it too. */
export const Switch = ({ label, description, ...props }: SwitchProps) => {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <div className={styles.row}>
      <span className={styles.text}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {description === undefined ? null : (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        )}
      </span>
      <span className={styles.control}>
        <input
          {...props}
          id={id}
          type="checkbox"
          role="switch"
          className={styles.switch}
          {...(description === undefined ? {} : { 'aria-describedby': descriptionId })}
        />
        <span className={styles.knob} aria-hidden="true" />
      </span>
    </div>
  );
};
