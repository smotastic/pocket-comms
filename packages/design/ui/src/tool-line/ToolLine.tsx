import { isPlainClick } from '../plain-click.js';
import hidden from '../visually-hidden.module.css';
import styles from './ToolLine.module.css';

export type ToolLineProps = {
  /** What the tool did, such as "Edited" or "Ran". */
  readonly verb: string;
  /** What it did it to, such as a file or a command; shown as code and cut to one line. */
  readonly target?: string;
  /** Lines added, shown when above zero. */
  readonly added?: number;
  /** Lines removed, shown when above zero. */
  readonly removed?: number;
  /** `ok` shows ✓, `error` shows ✗; `pending` and none show nothing. */
  readonly outcome?: 'ok' | 'error' | 'pending';
  /** A short note after the target, such as "running in the background". */
  readonly hint?: string;
  /** Makes the line a link to what the call opened, such as a subagent's conversation. */
  readonly href?: string;
  /** Opens `href` in the app, on a plain click or Enter. */
  readonly onNavigate?: () => void;
};

/** One tool call collapsed to a single line, such as "Edited `foo.ts` +12 −3". */
export const ToolLine = ({
  verb,
  target,
  added,
  removed,
  outcome,
  hint,
  href,
  onNavigate,
}: ToolLineProps) => {
  const content = (
    <>
      <span className={styles.verb}>{verb}</span>
      {target === undefined ? null : (
        <>
          {' '}
          <code className={styles.target}>{target}</code>
        </>
      )}
      {added !== undefined && added > 0 ? (
        <>
          {' '}
          <span className={styles.added}>+{added}</span>
        </>
      ) : null}
      {removed !== undefined && removed > 0 ? (
        <>
          {' '}
          <span className={styles.removed}>−{removed}</span>
        </>
      ) : null}
      {outcome === 'ok' || outcome === 'error' ? (
        <>
          {' '}
          <span className={`${styles.mark} ${styles[outcome]}`} aria-hidden="true">
            {outcome === 'ok' ? '✓' : '✗'}
          </span>
          <span className={hidden.visuallyHidden}>{outcome === 'ok' ? 'succeeded' : 'failed'}</span>
        </>
      ) : null}
      {hint === undefined ? null : (
        <>
          {' '}
          <span className={styles.hint}>{hint}</span>
        </>
      )}
    </>
  );
  return href === undefined ? (
    <div className={styles.line}>{content}</div>
  ) : (
    <a
      href={href}
      className={`${styles.line} ${styles.link}`}
      onClick={(event) => {
        if (onNavigate === undefined || !isPlainClick(event)) return;
        event.preventDefault();
        onNavigate();
      }}
    >
      {content}
    </a>
  );
};
