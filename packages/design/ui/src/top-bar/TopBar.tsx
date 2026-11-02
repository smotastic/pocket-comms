import { useContext, type ReactNode } from 'react';
import { DockedHeader } from '../layout/docked-header.js';
import styles from './TopBar.module.css';

export type TopBarProps = {
  /** The page heading. */
  readonly title: ReactNode;
  /** A line under the title, such as a status. */
  readonly subtitle?: ReactNode;
  /** Before the title, such as a back button. */
  readonly start?: ReactNode;
  /** After the title, such as a view switch. */
  readonly end?: ReactNode;
};

/**
 * The bar at the top of a screen, with its heading. It stays on top while the page scrolls, clear
 * of the notch, and lets the page show through blurred. Heading a docked page, it is only the row:
 * the page's header already does the rest.
 */
export const TopBar = ({ title, subtitle, start, end }: TopBarProps) => {
  const docked = useContext(DockedHeader);
  return (
    <header className={docked ? styles.docked : styles.bar}>
      <div className={styles.row}>
        {start}
        <div className={styles.titles}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle === undefined ? null : <div className={styles.subtitle}>{subtitle}</div>}
        </div>
        {end}
      </div>
    </header>
  );
};
