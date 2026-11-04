// Reads terminal output with ANSI escape sequences into lines of styled text. Only the SGR
// sequences (`ESC [ … m`) style the text; every other escape sequence and control character is
// dropped, and the text itself is never interpreted as markup.

/** One of the 16 terminal colours (0–7 normal, 8–15 bright), or a computed colour. */
export type AnsiColor =
  | { readonly palette: number }
  | { readonly rgb: readonly [number, number, number] };

export type AnsiStyle = {
  readonly fg?: AnsiColor;
  readonly bg?: AnsiColor;
  readonly bold?: true;
  readonly dim?: true;
  readonly italic?: true;
  readonly underline?: true;
  readonly inverse?: true;
};

export type AnsiSegment = { readonly text: string; readonly style: AnsiStyle };

/** One screen line: its runs of equally styled text, none when the line is empty. */
export type AnsiLine = ReadonlyArray<AnsiSegment>;

type MutableStyle = { -readonly [K in keyof AnsiStyle]: AnsiStyle[K] };
type Cell = { readonly char: string; readonly style: AnsiStyle };

const ESC = '\u001b';
const BEL = '\u0007';

// The 6×6×6 cube of the 256-colour palette uses these channel levels.
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;

const isByte = (value: number | undefined): value is number =>
  value !== undefined && Number.isInteger(value) && value >= 0 && value <= 255;

const color256 = (index: number): AnsiColor => {
  if (index < 16) return { palette: index };
  if (index < 232) {
    const cube = index - 16;
    const level = (n: number) => CUBE_LEVELS[n] ?? 0;
    return {
      rgb: [level(Math.floor(cube / 36)), level(Math.floor(cube / 6) % 6), level(cube % 6)],
    };
  }
  const gray = 8 + (index - 232) * 10;
  return { rgb: [gray, gray, gray] };
};

/**
 * Reads an extended colour (`38;5;n`, `38;2;r;g;b`) whose mode starts at `at`. Returns the colour,
 * or none for a malformed one, and how many parameters it used.
 */
const extendedColor = (
  params: ReadonlyArray<number>,
  at: number,
): { readonly color?: AnsiColor; readonly used: number } => {
  const mode = params[at];
  if (mode === 5) {
    const index = params[at + 1];
    return isByte(index) ? { color: color256(index), used: 2 } : { used: 2 };
  }
  if (mode === 2) {
    const [r, g, b] = [params[at + 1], params[at + 2], params[at + 3]];
    return isByte(r) && isByte(g) && isByte(b)
      ? { color: { rgb: [r, g, b] }, used: 4 }
      : { used: 4 };
  }
  return { used: 1 };
};

const applySgr = (current: AnsiStyle, raw: string): AnsiStyle => {
  const params =
    raw === '' ? [0] : raw.split(/[;:]/).map((part) => (part === '' ? 0 : Number(part)));
  let style: MutableStyle = { ...current };
  for (let i = 0; i < params.length; i++) {
    const code = params[i] ?? 0;
    if (code === 0) style = {};
    else if (code === 1) style.bold = true;
    else if (code === 2) style.dim = true;
    else if (code === 3) style.italic = true;
    else if (code === 4) style.underline = true;
    else if (code === 7) style.inverse = true;
    else if (code === 22) {
      delete style.bold;
      delete style.dim;
    } else if (code === 23) delete style.italic;
    else if (code === 24) delete style.underline;
    else if (code === 27) delete style.inverse;
    else if (code >= 30 && code <= 37) style.fg = { palette: code - 30 };
    else if (code >= 90 && code <= 97) style.fg = { palette: code - 90 + 8 };
    else if (code >= 40 && code <= 47) style.bg = { palette: code - 40 };
    else if (code >= 100 && code <= 107) style.bg = { palette: code - 100 + 8 };
    else if (code === 39) delete style.fg;
    else if (code === 49) delete style.bg;
    else if (code === 38 || code === 48) {
      const { color, used } = extendedColor(params, i + 1);
      if (color !== undefined) {
        if (code === 38) style.fg = color;
        else style.bg = color;
      }
      i += used;
    }
  }
  return style;
};

const sameStyle = (a: AnsiStyle, b: AnsiStyle) => JSON.stringify(a) === JSON.stringify(b);

const toSegments = (cells: ReadonlyArray<Cell>): AnsiLine => {
  const segments: Array<{ text: string; style: AnsiStyle }> = [];
  for (const cell of cells) {
    const last = segments.at(-1);
    if (last !== undefined && sameStyle(last.style, cell.style)) last.text += cell.char;
    else segments.push({ text: cell.char, style: cell.style });
  }
  return segments;
};

/** Splits terminal output into styled lines. */
export const parseAnsi = (text: string): ReadonlyArray<AnsiLine> => {
  const lines: Array<AnsiLine> = [];
  let cells: Array<Cell> = [];
  let column = 0;
  let style: AnsiStyle = {};
  const chars = Array.from(text);

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i] ?? '';
    if (char === ESC) {
      const next = chars[i + 1];
      if (next === '[') {
        // CSI: parameter and intermediate bytes, then one final byte in @–~.
        let end = i + 2;
        while (end < chars.length && !/[@-~]/.test(chars[end] ?? '')) end++;
        if (chars[end] === 'm') style = applySgr(style, chars.slice(i + 2, end).join(''));
        i = end;
      } else if (next === ']') {
        // OSC: ends at BEL or at ESC \.
        let end = i + 2;
        while (
          end < chars.length &&
          chars[end] !== BEL &&
          !(chars[end] === ESC && chars[end + 1] === '\\')
        )
          end++;
        i = chars[end] === ESC ? end + 1 : end;
      } else if (next === '(' || next === ')') {
        i += 2;
      } else {
        i += 1;
      }
    } else if (char === '\n') {
      lines.push(toSegments(cells));
      cells = [];
      column = 0;
    } else if (char === '\r') {
      // Before a line feed it ends the line; alone it returns to the line's start.
      if (chars[i + 1] !== '\n') column = 0;
    } else if (char === '\t' || char >= ' ') {
      if (char === '\u007f') continue;
      cells[column] = { char, style };
      column++;
    }
  }
  lines.push(toSegments(cells));
  return lines;
};
