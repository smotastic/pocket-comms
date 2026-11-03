import { Disclosure } from '../disclosure/Disclosure.js';
import { isPlainClick } from '../plain-click.js';
import styles from './BackgroundStrip.module.css';

export type BackgroundStripProps = {
  /** The running items, in the order to show them. */
  readonly items: ReadonlyArray<{
    readonly id: string;
    /** What kind of work it is, such as "Command" or "Subagent". */
    readonly kind: string;
    readonly description: string;
    /** How long it has been running, such as "12m". */
    readonly since: string;
    /** The address of the item's page, when it has one. */
    readonly href?: string;
    /** Opens `href` in the app, on a plain click or Enter. */
    readonly onNavigate?: () => void;
  }>;
  readonly expanded: boolean;
  readonly onToggle: () => void;
};

/**
 * The work an agent left running, as one line that opens to list each piece. A screen shows it only
 * while something runs.
 */
export const BackgroundStrip = ({ items, expanded, onToggle }: BackgroundStripProps) => (
  <div className={styles.strip}>
    <Disclosure
      title={`${items.length} running in the background`}
      expanded={expanded}
      onToggle={onToggle}
    >
      <ul className={styles.list}>
        {items.map((item) => {
          // The spaces keep the words apart in a link's name; the grid ignores them.
          const content = (
            <>
              <span className={styles.kind}>{item.kind}</span>{' '}
              <span className={styles.description}>{item.description}</span>{' '}
              <span className={styles.since}>{item.since}</span>
            </>
          );
          return (
            <li key={item.id}>
              {item.href === undefined ? (
                <span className={styles.item}>{content}</span>
              ) : (
                <a
                  href={item.href}
                  className={`${styles.item} ${styles.link}`}
                  onClick={(event) => {
                    if (item.onNavigate === undefined || !isPlainClick(event)) return;
                    event.preventDefault();
                    item.onNavigate();
                  }}
                >
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </Disclosure>
  </div>
);
