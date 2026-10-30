import { useMemo, type CSSProperties } from 'react';
import { parseAnsi, type AnsiColor, type AnsiSegment } from './ansi.js';
import styles from './TerminalScreen.module.css';

export type TerminalScreenProps = {
  /** Names the region for a screen reader, such as "Screen of kirk". */
  readonly label: string;
  /** Terminal output with ANSI escape sequences; it is shown as text, never as markup. */
  readonly text: string;
};

const rgb = ([r, g, b]: readonly [number, number, number]) => `rgb(${r}, ${g}, ${b})`;

// The 16 terminal colours come from the tokens through classes; a 256-colour or true colour is
// the terminal's own content, not a design value, so it is set inline.
const colour = (
  color: AnsiColor | undefined,
  layer: 'fg' | 'bg',
  inverse: boolean,
): { readonly className?: string; readonly value?: string } => {
  if (color === undefined) return inverse ? { className: styles[`${layer}Inverse`] } : {};
  if ('palette' in color) return { className: styles[`${layer}${color.palette}`] };
  return { value: rgb(color.rgb) };
};

const Segment = ({ segment }: { readonly segment: AnsiSegment }) => {
  const { style, text } = segment;
  const inverse = style.inverse === true;
  const fg = colour(inverse ? style.bg : style.fg, 'fg', inverse);
  const bg = colour(inverse ? style.fg : style.bg, 'bg', inverse);
  const className = [
    fg.className,
    bg.className,
    style.bold ? styles.bold : undefined,
    style.dim ? styles.dim : undefined,
    style.italic ? styles.italic : undefined,
    style.underline ? styles.underline : undefined,
  ]
    .filter((name) => name !== undefined)
    .join(' ');
  const inline: CSSProperties | undefined =
    fg.value === undefined && bg.value === undefined
      ? undefined
      : {
          ...(fg.value === undefined ? {} : { color: fg.value }),
          ...(bg.value === undefined ? {} : { backgroundColor: bg.value }),
        };
  if (className === '' && inline === undefined) return <>{text}</>;
  return (
    <span className={className === '' ? undefined : className} style={inline}>
      {text}
    </span>
  );
};

/**
 * A terminal's screen with its colours and styles, such as an agent's pane. It scrolls sideways
 * inside itself, so long lines never widen the page.
 */
export const TerminalScreen = ({ label, text }: TerminalScreenProps) => {
  const lines = useMemo(() => parseAnsi(text), [text]);
  return (
    // Focusable, so a keyboard can scroll it.
    <div role="region" aria-label={label} tabIndex={0} className={styles.screen}>
      <pre className={styles.text}>
        {lines.map((line, index) => (
          // Lines have no identity of their own; their position is their key.
          <span key={index}>
            {index > 0 ? '\n' : null}
            {line.map((segment, at) => (
              <Segment key={at} segment={segment} />
            ))}
          </span>
        ))}
      </pre>
    </div>
  );
};
