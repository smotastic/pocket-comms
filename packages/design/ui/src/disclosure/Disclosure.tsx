import { useId, type ReactNode } from 'react';
import type { Hue } from '../hue.js';
import styles from './Disclosure.module.css';

const HUE_CLASSES: Record<Hue, string | undefined> = {
  1: styles.hue1,
  2: styles.hue2,
  3: styles.hue3,
  4: styles.hue4,
  5: styles.hue5,
  neutral: styles.hueNeutral,
};

export type DisclosureProps = {
  /** What the entry is, such as a project's name; it also names the panel. */
  readonly title: string;
  /** A line under the title, such as counts. */
  readonly detail?: ReactNode;
  /** The colour of the entry's edge. Default `neutral`. */
  readonly hue?: Hue;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  /** The panel, shown below the entry while it is expanded. */
  readonly children: ReactNode;
};

/** An entry of a list that opens in place to show more below it, such as a project's issues. */
export const Disclosure = ({
  title,
  detail,
  hue = 'neutral',
  expanded,
  onToggle,
  children,
}: DisclosureProps) => {
  const panel = useId();
  return (
    <div className={`${styles.item} ${HUE_CLASSES[hue] ?? ''}`}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={expanded}
        aria-controls={panel}
        onClick={onToggle}
      >
        <span className={styles.text}>
          <span className={styles.title}>{title}</span>
          {detail === undefined ? null : (
            <>
              {' '}
              <span className={styles.detail}>{detail}</span>
            </>
          )}
        </span>
        <span
          className={expanded ? `${styles.chevron} ${styles.open}` : styles.chevron}
          aria-hidden="true"
        >
          ›
        </span>
      </button>
      {expanded ? (
        <div id={panel} role="region" aria-label={title} className={styles.panel}>
          {children}
        </div>
      ) : null}
    </div>
  );
};
