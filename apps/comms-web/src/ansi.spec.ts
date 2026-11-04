import { describe, expect, it } from 'vitest';
import { parseAnsi, type AnsiSegment } from './ansi.js';

const ESC = '\u001b';

// The text of each line, joined from its segments.
const texts = (input: string) =>
  parseAnsi(input).map((line) => line.map((segment) => segment.text).join(''));

const only = (input: string): AnsiSegment => {
  const [line] = parseAnsi(input);
  const [segment] = line ?? [];
  if (line?.length !== 1 || segment === undefined) throw new Error('Expected one segment.');
  return segment;
};

describe('parseAnsi', () => {
  it('keeps plain text as one unstyled segment per line', () => {
    expect(parseAnsi('hello')).toEqual([[{ text: 'hello', style: {} }]]);
  });

  it('splits lines on \\n and \\r\\n', () => {
    expect(texts('one\r\ntwo\nthree')).toEqual(['one', 'two', 'three']);
  });

  it('keeps an empty line as a line without segments', () => {
    expect(parseAnsi('a\n\nb')[1]).toEqual([]);
  });

  it('lets a lone carriage return overwrite the line from its start', () => {
    expect(texts('loading…\rdone')).toEqual(['doneing…']);
  });

  it('applies bold, dim, italic, underline and inverse', () => {
    expect(only(`${ESC}[1;2;3;4;7mx`).style).toEqual({
      bold: true,
      dim: true,
      italic: true,
      underline: true,
      inverse: true,
    });
  });

  it('turns attributes off one by one', () => {
    expect(only(`${ESC}[1;3;4;7m${ESC}[22;23;24;27mx`).style).toEqual({});
  });

  it('resets every attribute on 0 and on an empty parameter list', () => {
    const [line] = parseAnsi(`${ESC}[1;31ma${ESC}[0mb${ESC}[1mc${ESC}[md`);
    expect(line).toEqual([
      { text: 'a', style: { bold: true, fg: { palette: 1 } } },
      { text: 'b', style: {} },
      { text: 'c', style: { bold: true } },
      { text: 'd', style: {} },
    ]);
  });

  it('maps the 16 foreground and background colours to palette indexes', () => {
    expect(only(`${ESC}[32mx`).style).toEqual({ fg: { palette: 2 } });
    expect(only(`${ESC}[97mx`).style).toEqual({ fg: { palette: 15 } });
    expect(only(`${ESC}[41mx`).style).toEqual({ bg: { palette: 1 } });
    expect(only(`${ESC}[104mx`).style).toEqual({ bg: { palette: 12 } });
  });

  it('resets the default colours on 39 and 49', () => {
    expect(only(`${ESC}[31;42m${ESC}[39;49mx`).style).toEqual({});
  });

  it('maps 256-colour indexes below 16 to the palette and the rest to RGB', () => {
    expect(only(`${ESC}[38;5;6mx`).style).toEqual({ fg: { palette: 6 } });
    expect(only(`${ESC}[38;5;196mx`).style).toEqual({ fg: { rgb: [255, 0, 0] } });
    expect(only(`${ESC}[48;5;16mx`).style).toEqual({ bg: { rgb: [0, 0, 0] } });
    expect(only(`${ESC}[38;5;244mx`).style).toEqual({ fg: { rgb: [128, 128, 128] } });
  });

  it('reads true colour', () => {
    expect(only(`${ESC}[38;2;177;185;249mx`).style).toEqual({ fg: { rgb: [177, 185, 249] } });
    expect(only(`${ESC}[48;2;1;2;3mx`).style).toEqual({ bg: { rgb: [1, 2, 3] } });
  });

  it('ignores a colour whose parameters are missing or out of range', () => {
    expect(only(`${ESC}[38;2;300;0;0mx`).style).toEqual({});
    expect(only(`${ESC}[38;5mx`).style).toEqual({});
  });

  it('keeps reading the parameters after a true colour', () => {
    expect(only(`${ESC}[38;2;1;2;3;1mx`).style).toEqual({ fg: { rgb: [1, 2, 3] }, bold: true });
  });

  it('carries the style across lines', () => {
    expect(parseAnsi(`${ESC}[31ma\nb`)).toEqual([
      [{ text: 'a', style: { fg: { palette: 1 } } }],
      [{ text: 'b', style: { fg: { palette: 1 } } }],
    ]);
  });

  it('strips other escape sequences and control characters', () => {
    expect(
      texts(`${ESC}[2J${ESC}[?25la${ESC}]0;title\u0007b${ESC}]8;;url${ESC}\\c${ESC}(Bd\u0008e`),
    ).toEqual(['abcde']);
  });

  it('keeps tabs', () => {
    expect(texts('a\tb')).toEqual(['a\tb']);
  });

  it('keeps markup as text', () => {
    expect(texts('<b>&amp;</b>')).toEqual(['<b>&amp;</b>']);
  });

  it('merges neighbours of the same style into one segment', () => {
    expect(parseAnsi(`${ESC}[31ma${ESC}[31mb`)).toEqual([
      [{ text: 'ab', style: { fg: { palette: 1 } } }],
    ]);
  });
});
