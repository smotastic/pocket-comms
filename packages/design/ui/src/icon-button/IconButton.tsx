import type { ComponentPropsWithRef } from 'react';
import { Icon, type IconName } from './Icon.js';
import styles from './IconButton.module.css';

export type IconButtonProps = Omit<
  ComponentPropsWithRef<'button'>,
  'className' | 'style' | 'children' | 'aria-label' | 'aria-pressed'
> & {
  readonly icon: IconName;
  /** The button's name, which the icon alone cannot give, such as "Close". */
  readonly label: string;
  /** Makes it a toggle, such as a panel that is shown or not. */
  readonly pressed?: boolean;
  /** `primary` for the one main action, such as Send: round and in the accent. Default `quiet`. */
  readonly tone?: 'quiet' | 'primary';
  /** Shows a dot on the icon for a state the reader should notice, such as a filter that is on. */
  readonly marked?: boolean;
};

/** A button that shows only an icon, such as an action in a sheet's header. */
export const IconButton = ({
  icon,
  label,
  pressed,
  tone = 'quiet',
  marked = false,
  type = 'button',
  ...props
}: IconButtonProps) => (
  <button
    {...props}
    type={type}
    aria-label={label}
    aria-pressed={pressed}
    className={`${styles.button} ${styles[tone]}`}
  >
    <Icon name={icon} />
    {marked ? <span className={styles.mark} aria-hidden="true" /> : null}
  </button>
);
