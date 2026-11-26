import {
  MultiplexerRejectedError,
  MultiplexerUnavailableError,
} from '@pocket-comms/comms-application';
import type { DialogKey } from '@pocket-comms/comms-domain';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { createConnection, type Socket } from 'node:net';

// Raw input to an hc terminal (spec 033, plan: Input). After `hello` with `framed: true` every
// message is a frame `[channel u32 LE][kind u8][len u32 LE][payload]`; channel 0 carries JSON-RPC.
// `terminal.attach` opens a stream channel, and the bytes a viewer sends on it as DATA reach the
// program as typed. The core encodes no keys, so the app sends each key's own sequence. A viewer
// that attaches at the terminal's own size never resizes it.

const DATA = 0;
const CLOSE = 2;

/** The bytes of each dialog key, as a terminal in its normal modes sends them. */
export const KEY_SEQUENCES: Record<DialogKey, string> = {
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  up: '\u001b[A',
  down: '\u001b[B',
  right: '\u001b[C',
  left: '\u001b[D',
  enter: '\r',
  esc: '\u001b',
  'ctrl+c': '\u0003',
  pageup: '\u001b[5~',
  pagedown: '\u001b[6~',
};

const frame = (channel: number, kind: number, payload: Buffer): Buffer => {
  const head = Buffer.alloc(9);
  head.writeUInt32LE(channel, 0);
  head.writeUInt8(kind, 4);
  head.writeUInt32LE(payload.length, 5);
  return Buffer.concat([head, payload]);
};

const Reply = Schema.fromJsonString(
  Schema.Struct({
    id: Schema.optional(Schema.Unknown),
    result: Schema.optional(
      Schema.Struct({
        generation: Schema.optional(Schema.Number),
        channel: Schema.optional(Schema.Number),
      }),
    ),
    error: Schema.optional(
      Schema.Struct({
        code: Schema.Number,
        message: Schema.String,
        data: Schema.optional(
          Schema.NullOr(Schema.Struct({ kind: Schema.optional(Schema.NullOr(Schema.String)) })),
        ),
      }),
    ),
  }),
);
const decodeReply = Schema.decodeUnknownOption(Reply);

export interface AttachOptions {
  readonly path: string;
  readonly generation: number;
  readonly timeout: Duration.Input;
}

interface Attached {
  readonly socket: Socket;
  readonly channel: number;
  /**
   * `answered` once the core answers the viewer's CLOSE, so every byte before it has arrived;
   * `dropped` when the connection ends before that, so the bytes may be lost.
   */
  readonly closed: Promise<'answered' | 'dropped'>;
}

/**
 * Attaches to `terminal` at `cols` × `rows` and writes each chunk as its own DATA frame, `gap`
 * apart, then detaches.
 */
export const writeRaw =
  ({ path, generation, timeout }: AttachOptions) =>
  (
    terminal: string,
    size: { readonly cols: number; readonly rows: number },
    chunks: ReadonlyArray<string>,
    gap: Duration.Input,
  ): Effect.Effect<void, MultiplexerUnavailableError | MultiplexerRejectedError> => {
    const unavailable = (reason: string) => new MultiplexerUnavailableError({ reason });

    const attach = Effect.callback<
      Attached,
      MultiplexerUnavailableError | MultiplexerRejectedError
    >((resume) => {
      const socket = createConnection(path);
      let framed = false;
      let text = '';
      let bytes = Buffer.alloc(0);
      let settled = false;
      let attached: number | undefined;
      let endClose: (how: 'answered' | 'dropped') => void = () => undefined;
      const closed = new Promise<'answered' | 'dropped'>((resolve) => {
        endClose = resolve;
      });
      const fail = (error: MultiplexerUnavailableError | MultiplexerRejectedError) => {
        if (attached !== undefined) endClose('dropped');
        if (settled) return;
        settled = true;
        socket.destroy();
        resume(Effect.fail(error));
      };
      const frames = () => {
        while (bytes.length >= 9) {
          const length = bytes.readUInt32LE(5);
          if (bytes.length < 9 + length) return;
          const channel = bytes.readUInt32LE(0);
          const kind = bytes.readUInt8(4);
          const payload = bytes.subarray(9, 9 + length);
          bytes = bytes.subarray(9 + length);
          if (attached !== undefined) {
            if (channel === attached && kind === CLOSE) endClose('answered');
            continue;
          }
          if (channel !== 0 || kind !== DATA) continue;
          const reply = decodeReply(payload.toString('utf8'));
          if (reply._tag === 'None' || reply.value.id !== 1) continue;
          const { error, result } = reply.value;
          if (error !== undefined) {
            fail(
              new MultiplexerRejectedError({
                ref: terminal,
                code: error.data?.kind ?? String(error.code),
                message: error.message,
              }),
            );
            return;
          }
          if (result?.channel === undefined) {
            fail(unavailable('hc answered terminal.attach without a channel.'));
            return;
          }
          settled = true;
          attached = result.channel;
          resume(Effect.succeed({ socket, channel: result.channel, closed }));
        }
      };
      socket.on('connect', () => {
        socket.write(
          `${JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'hello', params: { framed: true, generation } })}\n`,
        );
      });
      socket.on('data', (chunk: Buffer) => {
        if (framed) {
          bytes = Buffer.concat([bytes, chunk]);
          frames();
          return;
        }
        text += chunk.toString('utf8');
        const end = text.indexOf('\n');
        if (end < 0) return;
        const hello = decodeReply(text.slice(0, end));
        bytes = Buffer.from(text.slice(end + 1), 'utf8');
        if (hello._tag === 'None' || hello.value.result?.generation !== generation) {
          fail(unavailable(`hc does not speak protocol generation ${generation}.`));
          return;
        }
        framed = true;
        const request = {
          jsonrpc: '2.0',
          id: 1,
          method: 'terminal.attach',
          params: { terminal, ...size },
        };
        socket.write(frame(0, DATA, Buffer.from(JSON.stringify(request), 'utf8')));
        frames();
      });
      socket.on('error', (error) => fail(unavailable(error.message)));
      socket.on('close', () => fail(unavailable('hc closed the socket before the attach.')));
      return Effect.sync(() => {
        settled = true;
        socket.destroy();
      });
    }).pipe(
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () => Effect.fail(unavailable('hc did not answer terminal.attach in time.')),
      }),
    );

    const dropped = unavailable('hc ended the input stream before the input arrived.');

    return Effect.acquireUseRelease(
      attach,
      ({ socket, channel, closed }) => {
        // A write to a connection hc ended would be lost without a word.
        const send = (kind: number, payload: Buffer) =>
          socket.destroyed
            ? Effect.fail(dropped)
            : Effect.sync(() => void socket.write(frame(channel, kind, payload)));
        return Effect.forEach(
          chunks,
          (chunk, index) =>
            (index === 0 ? Effect.void : Effect.sleep(gap)).pipe(
              Effect.andThen(send(DATA, Buffer.from(chunk, 'utf8'))),
            ),
          { discard: true },
        ).pipe(
          Effect.andThen(send(CLOSE, Buffer.alloc(0))),
          // The core answers CLOSE once it has the bytes before it. A connection that ends first
          // may have lost them; an open one whose old core does not answer is taken as delivered.
          Effect.andThen(
            Effect.promise(() => closed).pipe(
              Effect.timeoutOrElse({ duration: timeout, orElse: () => Effect.succeed('answered') }),
              Effect.flatMap((how) => (how === 'dropped' ? Effect.fail(dropped) : Effect.void)),
            ),
          ),
        );
      },
      ({ socket }) => Effect.sync(() => socket.destroy()),
    );
  };
