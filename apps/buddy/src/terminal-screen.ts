import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { Screen, type ScreenView } from './screen.js';

// The terminal as the buddy's screen: it is redrawn whole on every change.

const wrap = (text: string, width: number) => {
  const lines: Array<string> = [];
  let line = '';
  for (const word of text.split(/\s+/u).filter((part) => part !== '')) {
    if (line !== '' && line.length + 1 + word.length > width) {
      lines.push(line);
      line = '';
    }
    line = line === '' ? word.slice(0, width) : `${line} ${word}`;
  }
  if (line !== '') lines.push(line);
  return lines;
};

/** The screen as text of at most `width` columns. */
export const formatScreen = (view: ScreenView, width: number) => {
  const rule = '─'.repeat(width);
  const block = (text: string | undefined) =>
    text === undefined ? [] : ['', ...wrap(text, width)];
  return [
    ...wrap(view.status, width),
    rule,
    ...block(view.sent === undefined ? undefined : `You: ${view.sent}`),
    ...block(view.answer === undefined ? undefined : `Pi: ${view.answer}`),
    ...(view.proposal === undefined
      ? []
      : view.proposal.decidable
        ? [
            '',
            ...wrap(`Issue? ${view.proposal.text}`, width),
            ...wrap('y: create · n: discard', width),
          ]
        : ['', ...wrap(view.proposal.text, width)]),
    '',
    rule,
    ...wrap('space: talk, space again: send · Ctrl+C: quit', width),
  ].join('\n');
};

/** The width to draw in: the terminal's, up to 72 columns; 60 when it reports none or 0. */
export const screenWidth = (columns: number | undefined) =>
  columns === undefined || columns < 20 ? 60 : Math.min(columns, 72);

export const layer = Layer.succeed(Screen, {
  show: (view) =>
    Effect.sync(() => {
      const width = screenWidth(process.stdout.columns);
      process.stdout.write(`\u001b[2J\u001b[H${formatScreen(view, width)}\n`);
    }),
});
