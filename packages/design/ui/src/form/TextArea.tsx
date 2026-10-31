import type { ComponentPropsWithRef } from 'react';
import { Field, type FieldProps } from './Field.js';
import inputStyles from './Input.module.css';
import styles from './TextArea.module.css';

export type TextAreaProps = Omit<
  ComponentPropsWithRef<'textarea'>,
  'className' | 'style' | 'id' | 'aria-describedby' | 'aria-invalid'
> &
  Omit<FieldProps, 'children'>;

/** A text box of several lines, with its label; it grows by its `rows`. */
export const TextArea = ({ label, hideLabel, error, span, rows = 4, ...props }: TextAreaProps) => (
  <Field label={label} hideLabel={hideLabel} error={error} span={span}>
    {(control) => (
      <textarea
        rows={rows}
        {...props}
        {...control}
        className={`${inputStyles.input} ${styles.textArea}`}
      />
    )}
  </Field>
);
