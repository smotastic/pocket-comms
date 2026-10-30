import type { ComponentPropsWithRef } from 'react';
import styles from './Button.module.css';

export type ButtonProps = Omit<ComponentPropsWithRef<'button'>, 'className' | 'style'> & {
  /** `primary` for the main action, `danger` for a destructive one. Default `primary`. */
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** `sm` for actions inside a list row or a toolbar. Default `md`. */
  readonly size?: 'md' | 'sm';
};

/** A native button. It never submits a form unless `type="submit"` is given. */
export const Button = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) => (
  <button
    {...props}
    type={type}
    className={`${styles.button} ${styles[variant]} ${styles[size]}`}
  />
);
