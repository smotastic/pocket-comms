import { describe, expect, it } from 'vitest';
import { fixWavSizes } from './ffmpeg-recorder.js';

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const u32 = (value: number) => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  value >>> 24,
];
const UNKNOWN = [0xff, 0xff, 0xff, 0xff];

describe('fixWavSizes', () => {
  it('writes the real sizes a pipe could not, past a LIST chunk', () => {
    const fmt = [...ascii('fmt '), ...u32(16), ...new Array<number>(16).fill(1)];
    const list = [...ascii('LIST'), ...u32(4), ...ascii('INFO')];
    const samples = [1, 2, 3, 4, 5, 6];
    const bytes = Uint8Array.from([
      ...ascii('RIFF'),
      ...UNKNOWN,
      ...ascii('WAVE'),
      ...fmt,
      ...list,
      ...ascii('data'),
      ...UNKNOWN,
      ...samples,
    ]);

    const fixed = fixWavSizes(bytes);
    const view = new DataView(fixed.buffer);

    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
    const dataAt = 12 + fmt.length + list.length;
    expect(view.getUint32(dataAt + 4, true)).toBe(samples.length);
  });

  it('leaves bytes that are not WAV alone', () => {
    const bytes = Uint8Array.from(ascii('hello there!'));

    expect([...fixWavSizes(bytes)]).toEqual([...bytes]);
  });
});
