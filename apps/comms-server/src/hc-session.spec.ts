import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hookSessionLabel, labelSession, sessionStartOf } from './hc-session.js';
import { commsSession } from './pi-extension.js';

let server: Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
});

// A socket that records each request line and answers it, or stays silent.
const fakeHc = (silent = false) => {
  const path = join(mkdtempSync(join(tmpdir(), 'hc-session-')), 'hc.sock');
  const requests: Array<unknown> = [];
  server = createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      const request: unknown = JSON.parse(buffer.slice(0, end));
      requests.push(request);
      if (!silent) {
        socket.end(
          `${JSON.stringify({ jsonrpc: '2.0', id: Reflect.get(Object(request), 'id'), result: {} })}\n`,
        );
      }
    });
  });
  return new Promise<{ path: string; requests: Array<unknown> }>((resolve) =>
    server?.listen(path, () => resolve({ path, requests })),
  );
};

const labelOf = (terminal: string, session: string) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'terminal.label',
  params: { terminal, labels: { 'comms.session': session } },
});

describe('sessionStartOf', () => {
  it('names the session of a SessionStart, and of nothing else', () => {
    const start = (session: string) =>
      JSON.stringify({ hook_event_name: 'SessionStart', session_id: session, source: 'clear' });

    expect(sessionStartOf(start('5e6a-77'))).toBe('5e6a-77');
    expect(sessionStartOf(start('../x'))).toBeUndefined();
    expect(
      sessionStartOf(JSON.stringify({ hook_event_name: 'Stop', session_id: 'a' })),
    ).toBeUndefined();
    expect(sessionStartOf('not json')).toBeUndefined();
  });
});

describe('labelSession', () => {
  it("labels the agent's hc terminal with its session", async () => {
    const hc = await fakeHc();

    await labelSession({ socket: hc.path, terminal: 't17', session: 'abc-1' });

    expect(hc.requests).toEqual([labelOf('t17', 'abc-1')]);
  });

  it('gives up quietly when hc is away or does not answer', async () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'no-hc-')), 'hc.sock');
    await expect(
      labelSession({ socket: missing, terminal: 't1', session: 'a' }),
    ).resolves.toBeUndefined();

    const silent = await fakeHc(true);
    const started = Date.now();
    await labelSession({ socket: silent.path, terminal: 't1', session: 'a', limitMs: 100 });
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('hookSessionLabel', () => {
  const input = JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'abc-1' });

  it('labels only inside an hc terminal', async () => {
    const hc = await fakeHc();

    await hookSessionLabel(input, {});
    await hookSessionLabel(input, { HC_TERMINAL_ID: 't17' });
    await hookSessionLabel(input, { HC_TERMINAL_ID: 't17', HC_TERMINAL_SOCKET: hc.path });

    expect(hc.requests).toEqual([labelOf('t17', 'abc-1')]);
  });
});

describe('the Pi extension', () => {
  type Handler = (event: unknown, ctx: unknown) => Promise<void> | void;

  it('labels its hc terminal with the session file on each start or switch of a TUI session', async () => {
    const hc = await fakeHc();
    const handlers = new Map<string, Handler>();
    commsSession(
      { on: (event: string, handler: Handler) => void handlers.set(event, handler) },
      { HC_TERMINAL_ID: 't20', HC_TERMINAL_SOCKET: hc.path },
    );
    const start = handlers.get('session_start');
    const ctx = (file: string, mode = 'tui') => ({
      mode,
      sessionManager: { getSessionFile: () => file },
    });

    await start?.({ reason: 'startup' }, ctx('/home/me/.pi/agent/sessions/--x--/a.jsonl'));
    await start?.({ reason: 'new' }, ctx('/home/me/.pi/agent/sessions/--x--/b.jsonl'));
    await start?.({ reason: 'startup' }, ctx('/tmp/print.jsonl', 'print'));

    expect(hc.requests).toEqual([
      labelOf('t20', '/home/me/.pi/agent/sessions/--x--/a.jsonl'),
      labelOf('t20', '/home/me/.pi/agent/sessions/--x--/b.jsonl'),
    ]);
  });

  it('does nothing outside hc', () => {
    const handlers = new Map<string, Handler>();
    commsSession(
      { on: (event: string, handler: Handler) => void handlers.set(event, handler) },
      {},
    );

    expect(handlers.size).toBe(0);
  });
});
