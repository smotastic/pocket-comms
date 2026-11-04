import { Link, Text } from '@smotastic/pocket-design';
import { navigateOnPlainClick } from './links.js';

export type ToolLineProps = {
  /** What the tool did, such as "Edited" or "Ran". */
  readonly verb: string;
  /** What it did it to, such as a file or a command; shown as code. */
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

const MARKS = {
  ok: { mark: '✓', name: 'succeeded' },
  error: { mark: '✗', name: 'failed' },
} as const;

/** One tool call collapsed to a single line, such as "Edited `foo.ts` +12 −3 ✓". */
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
  // Each word in an element of its own, so it can be found by its text.
  const words = [
    <span key="verb">{verb}</span>,
    target === undefined ? null : <code key="target">{target}</code>,
    added !== undefined && added > 0 ? <span key="added">+{added}</span> : null,
    removed !== undefined && removed > 0 ? <span key="removed">−{removed}</span> : null,
    outcome === 'ok' || outcome === 'error' ? (
      // The mark is a picture with a name, so a screen reader says the outcome in words.
      <span key="outcome" role="img" aria-label={MARKS[outcome].name}>
        {MARKS[outcome].mark}
      </span>
    ) : null,
    hint === undefined ? null : <span key="hint">{hint}</span>,
  ].filter((word) => word !== null);
  // Spaces keep the words apart, also in a link's name.
  const content = words.flatMap((word, index) => (index === 0 ? [word] : [' ', word]));
  return (
    <Text tone="muted" size="sm">
      {href === undefined ? (
        content
      ) : (
        <Link
          href={href}
          {...(onNavigate === undefined ? {} : { onClick: navigateOnPlainClick(onNavigate) })}
        >
          {content}
        </Link>
      )}
    </Text>
  );
};
