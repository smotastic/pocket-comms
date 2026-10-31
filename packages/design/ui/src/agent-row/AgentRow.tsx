import type { MouseEvent, ReactNode } from 'react';
import hidden from '../visually-hidden.module.css';
import styles from './AgentRow.module.css';

export type AgentRowProps = {
  /** The address of the agent's page; the browser uses it to open a new tab or copy the link. */
  readonly href: string;
  /** Opens the agent's page in the app, on a plain click or Enter. */
  readonly onNavigate: () => void;
  /** `mark` is the tile's short sign ("C", "π"); `label` names the kind for a screen reader. */
  readonly kind: {
    readonly mark: string;
    readonly label: string;
    readonly tone: 'claude' | 'pi' | 'other';
  };
  readonly name: string;
  /** At the end of the first line, such as a `StatusPill`. */
  readonly status: ReactNode;
  /** The second line, such as the agent's current task. */
  readonly detail: ReactNode;
  /** How long ago the agent last changed, such as "4m". */
  readonly since: string;
  /** Tints the row for something that needs the reader. */
  readonly attention?: 'blocked' | 'done';
};

// A click with a modifier or another button opens a tab or a menu; the browser keeps it.
const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** One agent in a list: its kind, name and status, and what it is doing. A link to its page. */
export const AgentRow = ({
  href,
  onNavigate,
  kind,
  name,
  status,
  detail,
  since,
  attention,
}: AgentRowProps) => (
  <a
    href={href}
    className={attention === undefined ? styles.row : `${styles.row} ${styles[attention]}`}
    onClick={(event) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      onNavigate();
    }}
  >
    <span className={`${styles.kind} ${styles[kind.tone]}`} aria-hidden="true">
      {kind.mark}
    </span>
    {/* The spaces keep the words apart in the link's name; the grid ignores them. */}
    <span className={hidden.visuallyHidden}>{kind.label}</span>{' '}
    <span className={styles.name}>{name}</span> <span className={styles.status}>{status}</span>{' '}
    <span className={styles.detail}>
      {detail} · {since}
    </span>
  </a>
);
