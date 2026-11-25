/**
 * Tells hc which session an agent works in (spec 033, requirement 9): the agent's hc terminal
 * gets the label `comms.session`, which the server reads to find the agent's session file. The
 * Claude hook (`claude-hook.ts`) and the Pi extension (`pi-extension.ts`) call it when a session
 * starts, resumes or is cleared. hc gives every program it runs `HC_TERMINAL_ID` and
 * `HC_TERMINAL_SOCKET`; outside hc nothing happens.
 *
 * Node built-ins only, so it runs from the built release alone, and it never fails or waits long:
 * the agent goes on regardless.
 */
import { createConnection } from 'node:net';

const SESSION = /^[A-Za-z0-9-]{1,128}$/u;

/** The session a Claude `SessionStart` hook input names, when it is one with a valid id. */
export const sessionStartOf = (input: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(input);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    if (Reflect.get(parsed, 'hook_event_name') !== 'SessionStart') return undefined;
    const session: unknown = Reflect.get(parsed, 'session_id');
    return typeof session === 'string' && SESSION.test(session) ? session : undefined;
  } catch {
    return undefined;
  }
};

/** Sets the label on the terminal; resolves on hc's answer, on any error, or after `limitMs`. */
export const labelSession = ({
  socket: path,
  terminal,
  session,
  limitMs = 2_000,
}: {
  readonly socket: string;
  readonly terminal: string;
  readonly session: string;
  readonly limitMs?: number;
}): Promise<void> =>
  new Promise((resolve) => {
    const socket = createConnection(path);
    const done = () => {
      clearTimeout(timer);
      socket.destroy();
      resolve();
    };
    const timer = setTimeout(done, limitMs);
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'terminal.label',
        params: { terminal, labels: { 'comms.session': session } },
      };
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on('data', (chunk: string) => {
      if (chunk.includes('\n')) done();
    });
    socket.on('error', done);
    socket.on('close', done);
  });

/** The terminal and socket of the hc terminal a program runs in, or none outside hc. */
export const hcTerminalOf = (
  env: Readonly<Record<string, string | undefined>>,
): { readonly terminal: string; readonly socket: string } | undefined => {
  const terminal = env['HC_TERMINAL_ID'];
  const socket = env['HC_TERMINAL_SOCKET'];
  return terminal === undefined || terminal === '' || socket === undefined || socket === ''
    ? undefined
    : { terminal, socket };
};

/** What the Claude hook does for hc: label the terminal on a `SessionStart`. */
export const hookSessionLabel = async (
  input: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<void> => {
  const where = hcTerminalOf(env);
  const session = sessionStartOf(input);
  if (where === undefined || session === undefined) return;
  await labelSession({ ...where, session });
};
