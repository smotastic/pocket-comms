import type { ComponentPropsWithRef } from 'react';
import { Field, type FieldProps } from './Field.js';
import inputStyles from './Input.module.css';
import styles from './Select.module.css';

export type SelectProps = Omit<
  ComponentPropsWithRef<'select'>,
  'className' | 'style' | 'id' | 'aria-describedby' | 'aria-invalid' | 'children' | 'multiple'
> &
  Omit<FieldProps, 'children'> & {
    readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  };

/** A drop-down choice of one option, with its label; on a phone it opens the system picker. */
export const Select = ({ label, hideLabel, error, span, options, ...props }: SelectProps) => (
  <Field label={label} hideLabel={hideLabel} error={error} span={span}>
    {(control) => (
      <select {...props} {...control} className={`${inputStyles.input} ${styles.select}`}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )}
  </Field>
);
