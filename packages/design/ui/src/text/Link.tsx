import type { ComponentPropsWithRef } from 'react';
import styles from './Link.module.css';

export type LinkProps = Omit<
  ComponentPropsWithRef<'a'>,
  'className' | 'style' | 'target' | 'rel'
> & {
  /** `strong` for a standalone link that is the title of an item, never inside running text. */
  readonly emphasis?: 'normal' | 'strong';
  /** Opens another site in a new tab, without giving it access to this page. */
  readonly external?: boolean;
};

/** A link. */
export const Link = ({ emphasis = 'normal', external = false, ...props }: LinkProps) => (
  <a
    {...props}
    {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    className={`${styles.link} ${styles[emphasis]}`}
  />
);
