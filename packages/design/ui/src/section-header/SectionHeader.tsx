import { isPlainClick } from '../plain-click.js';
import styles from './SectionHeader.module.css';

export type SectionHeaderProps = {
  readonly title: string;
  /** How many items the section holds, shown faint after the title. */
  readonly count?: number;
  /** The level in the document outline. Default 2. */
  readonly level?: 2 | 3;
  /** Makes the title a link, such as to the page of what the section lists. */
  readonly link?: {
    readonly href: string;
    /** The link's name, such as "Open pocket-home"; it contains the title. */
    readonly label: string;
    /** Called on a plain click instead of following the link. */
    readonly onNavigate: () => void;
  };
};

/** The small uppercase label above a group of items, with an optional count and link. */
export const SectionHeader = ({ title, count, level = 2, link }: SectionHeaderProps) => {
  const Tag = `h${level}` as const;
  return (
    <Tag className={styles.header}>
      {link === undefined ? (
        title
      ) : (
        <a
          href={link.href}
          aria-label={link.label}
          className={styles.link}
          onClick={(event) => {
            if (!isPlainClick(event)) return;
            event.preventDefault();
            link.onNavigate();
          }}
        >
          {title}
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </a>
      )}
      {count === undefined ? null : (
        <>
          {' '}
          <span className={styles.count}>{count}</span>
        </>
      )}
    </Tag>
  );
};
