import * as Effect from 'effect/Effect';
import { mkdtempSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface HcRequest {
  readonly id: unknown;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

/** What the fake answers: a `result`, a JSON-RPC `error` with hc's `data.kind`, or nothing. */
export type HcReply =
  | { readonly result: unknown }
  | { readonly error: { readonly kind: string; readonly message: string } }
  | 'silent';

/** One frame of hc's framed mode: `[channel u32 LE][kind u8][len u32 LE][payload]`. */
export interface HcFrame {
  readonly channel: number;
  readonly kind: number;
  readonly payload: Buffer;
}

export const frame = (channel: number, kind: number, payload: Buffer | string): Buffer => {
  const body = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  const head = Buffer.alloc(9);
  head.writeUInt32LE(channel, 0);
  head.writeUInt8(kind, 4);
  head.writeUInt32LE(body.length, 5);
  return Buffer.concat([head, body]);
};

const ATTACH_CHANNEL = 1;

/**
 * An hc socket for adapter tests. It records every request and every stream frame, answers through
 * `reply`, keeps `events.subscribe` connections open so a test can `emit` events to them, and
 * speaks framed mode after `hello` with `framed: true`, where `terminal.attach` opens channel 1.
 */
export const fakeHcServer = (reply: (request: HcRequest) => HcReply) =>
  Effect.acquireRelease(
    Effect.callback<{
      readonly path: string;
      readonly requests: Array<HcRequest>;
      /** The frames viewers sent on attach channels, in order. */
      readonly frames: Array<HcFrame>;
      readonly emit: (event: unknown) => void;
      readonly closeSubscribers: () => void;
      readonly close: () => void;
    }>((resume) => {
      const path = join(mkdtempSync(join(tmpdir(), 'hc-')), 'hc.sock');
      const requests: Array<HcRequest> = [];
      const frames: Array<HcFrame> = [];
      const subscribers = new Set<Socket>();

      const parse = (text: string): HcRequest | undefined => {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== 'object' || parsed === null) return undefined;
        return {
          id: Reflect.get(parsed, 'id'),
          method: String(Reflect.get(parsed, 'method')),
          params: Object(Reflect.get(parsed, 'params')),
        };
      };
      const answer = (request: HcRequest): string | undefined => {
        if (request.method === 'hello') {
          return JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: { generation: 1, framed: request.params['framed'] === true },
          });
        }
        const replied = reply(request);
        if (replied === 'silent') return undefined;
        return JSON.stringify(
          'error' in replied
            ? {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                  code: -32000,
                  message: replied.error.message,
                  data: { kind: replied.error.kind },
                },
              }
            : { jsonrpc: '2.0', id: request.id, result: replied.result },
        );
      };

      const server = createServer((socket) => {
        let lines = '';
        let framed = false;
        let bytes = Buffer.alloc(0);
        socket.on('error', () => undefined);
        socket.on('close', () => subscribers.delete(socket));
        socket.on('data', (chunk: Buffer) => {
          if (framed) {
            bytes = Buffer.concat([bytes, chunk]);
            while (bytes.length >= 9) {
              const length = bytes.readUInt32LE(5);
              if (bytes.length < 9 + length) break;
              const received: HcFrame = {
                channel: bytes.readUInt32LE(0),
                kind: bytes.readUInt8(4),
                payload: bytes.subarray(9, 9 + length),
              };
              bytes = bytes.subarray(9 + length);
              if (received.channel !== 0) {
                frames.push(received);
                if (received.kind === 2) socket.write(frame(received.channel, 2, ''));
                continue;
              }
              const request = parse(received.payload.toString('utf8'));
              if (request === undefined) continue;
              requests.push(request);
              const answered =
                request.method === 'terminal.attach'
                  ? JSON.stringify({
                      jsonrpc: '2.0',
                      id: request.id,
                      result: { channel: ATTACH_CHANNEL, automatic_input: true },
                    })
                  : answer(request);
              if (answered !== undefined) socket.write(frame(0, 0, answered));
              if (request.method === 'terminal.attach') {
                socket.write(frame(ATTACH_CHANNEL, 0, 'first paint'));
              }
            }
            return;
          }
          lines += chunk.toString('utf8');
          let end = lines.indexOf('\n');
          while (end >= 0) {
            const request = parse(lines.slice(0, end));
            lines = lines.slice(end + 1);
            end = lines.indexOf('\n');
            if (request === undefined) continue;
            requests.push(request);
            if (request.method === 'events.subscribe') {
              subscribers.add(socket);
              socket.write(
                `${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { seq: 1, terminals: [] } })}\n`,
              );
              continue;
            }
            const answered = answer(request);
            if (answered !== undefined) socket.write(`${answered}\n`);
            if (request.method === 'hello' && request.params['framed'] === true) {
              framed = true;
              bytes = Buffer.from(lines, 'utf8');
              lines = '';
              return;
            }
          }
        });
      });
      server.listen(path, () =>
        resume(
          Effect.succeed({
            path,
            requests,
            frames,
            emit: (event: unknown) => {
              for (const socket of subscribers) socket.write(`${JSON.stringify(event)}\n`);
            },
            closeSubscribers: () => {
              for (const socket of subscribers) socket.destroy();
            },
            close: () => {
              for (const socket of subscribers) socket.destroy();
              server.close();
            },
          }),
        ),
      );
    }),
    (server) => Effect.sync(server.close),
  );

/** One terminal as `terminal.list` and `terminal.get` answer it, trimmed to what the app reads. */
export const hcTerminal = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  address: 't1',
  name: null,
  cwd: '/work/app',
  created_ms: 1,
  foreground: { name: 'zsh', cwd: '/work/app' },
  labels: {},
  state: 'live',
  status: null,
  title: '',
  turn: 0,
  cols: 200,
  rows: 120,
  ...overrides,
});
