import type { ReactNode } from 'react';
import styles from './Tag.module.css';

export type TagProps = { readonly children: ReactNode };

/** A short label, such as a keyword attached to an item. */
export const Tag = ({ children }: TagProps) => <span className={styles.tag}>{children}</span>;
