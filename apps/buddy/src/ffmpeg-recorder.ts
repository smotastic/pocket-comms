import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { spawn } from 'node:child_process';
import { Recorder, RecorderError } from './recorder.js';

// The laptop's microphone through `ffmpeg` (macOS AVFoundation): 16 kHz mono WAV, about 3.8 MB
// for the two minutes a recording may last. `q` on its input ends a recording cleanly.

const text = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0, bytes[at + 3] ?? 0);

/**
 * The WAV with its RIFF and data sizes filled in: written to a pipe, `ffmpeg` cannot go back to
 * them and leaves them unknown. Anything that is not WAV comes back as it is.
 */
export const fixWavSizes = (bytes: Uint8Array): Uint8Array => {
  if (bytes.length < 12 || text(bytes, 0) !== 'RIFF' || text(bytes, 8) !== 'WAVE') return bytes;
  const fixed = Uint8Array.from(bytes);
  const view = new DataView(fixed.buffer);
  view.setUint32(4, fixed.length - 8, true);
  let at = 12;
  while (at + 8 <= fixed.length) {
    if (text(fixed, at) === 'data') {
      view.setUint32(at + 4, fixed.length - at - 8, true);
      break;
    }
    const size = view.getUint32(at + 4, true);
    at += 8 + size + (size % 2);
  }
  return fixed;
};

/** How long a recorder may take to end after `q` before it is killed. */
const STOP_MILLIS = 5_000;

/** The parts of a recorder process: the program and its arguments. */
export interface RecorderCommand {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly stopMillis?: number;
}

/** The arguments that record from the AVFoundation audio device `device`. */
export const ffmpegArgs = (device: string) => [
  ...['-hide_banner', '-loglevel', 'error', '-f', 'avfoundation', '-i', `:${device}`],
  ...['-ac', '1', '-ar', '16000', '-f', 'wav', 'pipe:1'],
];

/**
 * A recorder over a process that writes WAV to its output and ends on `q`. A process that does
 * not end in time is killed, as is one whose recording is interrupted; what it wrote is kept.
 */
export const make = ({ command, args, stopMillis = STOP_MILLIS }: RecorderCommand) =>
  Recorder.of({
    start: Effect.callback<
      { readonly stop: Effect.Effect<Uint8Array, RecorderError> },
      RecorderError
    >((resume, signal) => {
      const chunks: Array<Buffer> = [];
      let errors = '';
      const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
      const ended = new Promise<void>((done) => child.on('close', () => done()));
      const kill = () => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      };
      signal.addEventListener('abort', kill);
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()));
      // A process that is gone closes its input; writing `q` to it then must not crash the buddy.
      child.stdin.on('error', () => undefined);
      child.on('error', () =>
        resume(
          Effect.fail(
            new RecorderError({ reason: `${command} is not installed: brew install ${command}.` }),
          ),
        ),
      );
      child.on('spawn', () =>
        resume(
          Effect.succeed({
            stop: Effect.tryPromise({
              try: async () => {
                if (child.exitCode === null) child.stdin.end('q');
                const timer = setTimeout(kill, stopMillis);
                await ended;
                clearTimeout(timer);
                const bytes = Buffer.concat(chunks);
                if (bytes.length === 0) throw new Error(errors.trim().split('\n').at(-1));
                return fixWavSizes(new Uint8Array(bytes));
              },
              catch: (error) =>
                new RecorderError({
                  reason:
                    error instanceof Error && error.message !== ''
                      ? `The microphone did not record: ${error.message}`
                      : 'The microphone did not record.',
                }),
            }).pipe(Effect.onInterrupt(() => Effect.sync(kill))),
          }),
        ),
      );
    }),
  });

export const layer = (device: string) =>
  Layer.succeed(Recorder, make({ command: 'ffmpeg', args: ffmpegArgs(device) }));
