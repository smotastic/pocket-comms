import type { Hue } from '../hue.js';
import { Icon } from '../icon-button/Icon.js';
import { isPlainClick } from '../plain-click.js';
import hidden from '../visually-hidden.module.css';
import styles from './AgentRow.module.css';

const HUE_CLASSES: Record<Hue, string | undefined> = {
  1: styles.hue1,
  2: styles.hue2,
  3: styles.hue3,
  4: styles.hue4,
  5: styles.hue5,
  neutral: styles.hueNeutral,
};

const DOT_CLASSES: Record<AgentRowProps['status']['tone'], string | undefined> = {
  working: styles.dotWorking,
  blocked: styles.dotBlocked,
  done: styles.dotDone,
  idle: undefined,
  unknown: undefined,
};

/** Where a row leads; a row without it is plain, such as an event of an agent that is gone. */
type RowLink =
  | {
      /** The address of the agent's page; the browser uses it to open a new tab or copy the link. */
      readonly href: string;
      /** Opens the agent's page in the app, on a plain click or Enter. */
      readonly onNavigate: () => void;
    }
  | { readonly href?: undefined; readonly onNavigate?: undefined };

export type AgentRowProps = RowLink & {
  /** Sets the dot's colour; `working` also pulses it. The label says it in words. */
  readonly status: {
    readonly tone: 'working' | 'blocked' | 'done' | 'idle' | 'unknown';
    readonly label: string;
  };
  readonly name: string;
  /** After the name, such as the agent's worktree. */
  readonly worktree?: string;
  /** How long ago the agent last changed, such as "4m". */
  readonly since: string;
  /** The project's name, before the title. */
  readonly project?: string;
  /** The colour of the row's edge and of its project label. Default `neutral`. */
  readonly hue?: Hue;
  /** The second line, such as the agent's current task. */
  readonly title: string;
  /** Tints the row for something that needs the reader. */
  readonly attention?: 'blocked' | 'done';
  /** Work the agent left running: a marker with the count; the label says it in words. */
  readonly background?: { readonly count: number; readonly label: string };
};

/**
 * One agent in a list: its status, name and project, and what it is doing. A link to its page,
 * or a plain row without `href`.
 */
export const AgentRow = ({
  href,
  onNavigate,
  status,
  name,
  worktree,
  since,
  project,
  hue = 'neutral',
  title,
  attention,
  background,
}: AgentRowProps) => {
  const className = [
    styles.row,
    HUE_CLASSES[hue],
    href === undefined ? '' : styles.link,
    attention === undefined ? '' : styles[attention],
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      {/* The spaces keep the words apart in the link's name; the grid ignores them. */}
      <span className={styles.first}>
        <span
          className={[styles.dot, DOT_CLASSES[status.tone]].filter(Boolean).join(' ')}
          aria-hidden="true"
        />
        <span className={styles.name}>{name}</span>
        {worktree === undefined ? null : (
          <>
            {' '}
            <span className={styles.worktree}>· {worktree}</span>
          </>
        )}
        {background === undefined ? null : (
          <span className={styles.background} aria-hidden="true">
            <Icon name="background" />
            {background.count}
          </span>
        )}
      </span>{' '}
      <span className={hidden.visuallyHidden}>{status.label}</span>{' '}
      {background === undefined ? null : (
        <>
          <span className={hidden.visuallyHidden}>{background.label}</span>{' '}
        </>
      )}
      <span className={styles.second}>
        {project === undefined ? null : (
          <>
            <span className={styles.project}>{project}</span>{' '}
          </>
        )}
        {title}
      </span>{' '}
      <span className={styles.since}>{since}</span>
    </>
  );
  return href === undefined ? (
    <div className={className}>{content}</div>
  ) : (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onNavigate();
      }}
    >
      {content}
    </a>
  );
};
