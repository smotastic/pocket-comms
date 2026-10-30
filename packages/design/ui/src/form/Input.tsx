import type { ComponentPropsWithRef } from 'react';
import { Field, type FieldProps } from './Field.js';
import styles from './Input.module.css';

export type InputProps = Omit<
  ComponentPropsWithRef<'input'>,
  'className' | 'style' | 'id' | 'aria-describedby' | 'aria-invalid'
> &
  Omit<FieldProps, 'children'>;

/** A text input with its label, which it always needs; `hideLabel` hides it visually only. */
export const Input = ({ label, hideLabel, error, span, ...props }: InputProps) => (
  <Field label={label} hideLabel={hideLabel} error={error} span={span}>
    {(control) => <input {...props} {...control} className={styles.input} />}
  </Field>
);
