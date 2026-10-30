import type { ReactNode } from 'react';
import styles from './Alert.module.css';

export type AlertProps = { readonly children: ReactNode };

/**
 * An error message that assistive technology announces as soon as it appears. Render it only
 * while there is an error, rather than keeping an empty one mounted.
 */
export const Alert = ({ children }: AlertProps) => (
  <div role="alert" className={styles.alert}>
    {children}
  </div>
);
