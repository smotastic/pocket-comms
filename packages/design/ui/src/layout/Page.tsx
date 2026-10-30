import type { ReactNode } from 'react';
import styles from './Layout.module.css';

export type PageProps = { readonly children: ReactNode };

/** The main content of a page: centered, width-limited and padded. */
export const Page = ({ children }: PageProps) => <main className={styles.page}>{children}</main>;
