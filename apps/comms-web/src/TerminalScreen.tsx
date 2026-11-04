import { Markdown } from '@smotastic/pocket-design';
import { useMemo } from 'react';
import { parseAnsi } from './ansi.js';

/** The screen's text without its escape sequences, one line per screen line. */
const plainText = (text: string) =>
  parseAnsi(text)
    .map((line) => line.map((segment) => segment.text).join(''))
    .join('\n');

/** A fenced code block of the text: the fence is longer than any run of backticks in it. */
const codeBlock = (text: string) => {
  const longest = Math.max(0, ...[...text.matchAll(/`+/gu)].map((run) => run[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}\n${text}\n${fence}`;
};

/**
 * A terminal's screen, such as an agent's pane, as a code block of the kit, which scrolls sideways
 * inside itself. The kit has no terminal view yet, so the screen shows without its colours.
 */
export const TerminalScreen = ({
  label,
  text,
}: {
  /** Names the region for a screen reader, such as "Screen of kirk". */
  readonly label: string;
  /** Terminal output with ANSI escape sequences; it is shown as text, never as markup. */
  readonly text: string;
}) => {
  const block = useMemo(() => codeBlock(plainText(text)), [text]);
  return (
    <div role="region" aria-label={label}>
      <Markdown text={block} />
    </div>
  );
};
