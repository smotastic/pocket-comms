import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import { fixWavSizes, make } from './ffmpeg-recorder.js';

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const u32 = (value: number) => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  value >>> 24,
];
const UNKNOWN = [0xff, 0xff, 0xff, 0xff];

/** A stand-in recorder: node running `script`, which gets stdin and writes to stdout. */
const node = (script: string, stopMillis?: number) =>
  make({
    command: process.execPath,
    args: ['-e', script],
    ...(stopMillis === undefined ? {} : { stopMillis }),
  });

describe('a recorder process', () => {
  it.live('answers what it wrote when it ends on q', () =>
    Effect.gen(function* () {
      const recording = yield* node(
        "process.stdout.write('RIFF0000WAVE');" +
          "process.stdin.on('data', (d) => { if (String(d).includes('q')) process.exit(0); });",
      ).start;

      const bytes = yield* recording.stop;

      expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe('RIFF');
      expect(new DataView(bytes.buffer).getUint32(4, true)).toBe(4);
    }),
  );

  it.live('kills a process that does not end in time and keeps what it wrote', () =>
    Effect.gen(function* () {
      const recording = yield* node(
        "process.stdout.write('RIFF0000WAVE'); process.stdin.resume(); setInterval(() => {}, 1000);",
        // Long enough for node to start and write on a busy machine.
        2_000,
      ).start;

      const bytes = yield* recording.stop;

      expect(bytes.length).toBe(12);
    }),
  );

  it.live('says why when the process wrote nothing', () =>
    Effect.gen(function* () {
      const recording = yield* node("process.stderr.write('Permission denied'); process.exit(1);")
        .start;
      yield* Effect.sleep(200);

      const error = yield* recording.stop.pipe(Effect.flip);

      expect(error.reason).toBe('The microphone did not record: Permission denied');
    }),
  );

  it.live('says the program is missing', () =>
    Effect.gen(function* () {
      const error = yield* make({ command: 'no-such-recorder-here', args: [] }).start.pipe(
        Effect.flip,
      );

      expect(error.reason).toContain('no-such-recorder-here is not installed');
    }),
  );
});

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
