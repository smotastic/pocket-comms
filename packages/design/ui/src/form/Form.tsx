import type { ComponentPropsWithRef, ReactNode } from 'react';
import styles from './Form.module.css';

/** A form needs an accessible name, so assistive technology lists it as a landmark. */
type FormName = { readonly 'aria-label': string } | { readonly 'aria-labelledby': string };

export type FormProps = Omit<
  ComponentPropsWithRef<'form'>,
  'className' | 'style' | 'aria-label' | 'aria-labelledby'
> &
  FormName & {
    /** Fields per row. Default 1. */
    readonly columns?: 1 | 2;
    /** The buttons, in a row of their own at the end. */
    readonly actions?: ReactNode;
  };

/** A named form that lays out its fields in a grid. */
export const Form = ({ columns = 1, actions, children, ...props }: FormProps) => (
  <form {...props} className={`${styles.form} ${styles[`columns${columns}`]}`}>
    {children}
    {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
  </form>
);
