import styles from './SectionHeader.module.css';

export type SectionHeaderProps = {
  readonly title: string;
  /** How many items the section holds, shown faint after the title. */
  readonly count?: number;
  /** The level in the document outline. Default 2. */
  readonly level?: 2 | 3;
};

/** The small uppercase label above a group of items, with an optional count. */
export const SectionHeader = ({ title, count, level = 2 }: SectionHeaderProps) => {
  const Tag = `h${level}` as const;
  return (
    <Tag className={styles.header}>
      {title}
      {count === undefined ? null : (
        <>
          {' '}
          <span className={styles.count}>{count}</span>
        </>
      )}
    </Tag>
  );
};
