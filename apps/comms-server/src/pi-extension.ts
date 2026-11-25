/**
 * A Pi extension that tells hc which session Pi works in (spec 033, requirement 9): on each start
 * or switch of a TUI session it labels Pi's hc terminal with the session file. Set it up once per
 * machine, from the deployed release:
 * `ln -s ~/pocket-cloud-data/pocket-comms/current/apps/comms-server/dist/pi-extension.js ~/.pi/agent/extensions/comms-session.js`.
 * Outside hc it registers nothing; a failed label never gets in Pi's way.
 */
import { hcTerminalOf, labelSession } from './hc-session.js';

type Handler = (event: unknown, ctx: unknown) => Promise<void> | void;

/** The part of Pi's extension API the extension uses. */
export interface PiEvents {
  readonly on: (event: string, handler: Handler) => void;
}

// The session file Pi works in; only a TUI session runs in a terminal the owner can see.
const sessionFileOf = (ctx: unknown): string | undefined => {
  try {
    if (typeof ctx !== 'object' || ctx === null || Reflect.get(ctx, 'mode') !== 'tui') {
      return undefined;
    }
    const manager: unknown = Reflect.get(ctx, 'sessionManager');
    if (typeof manager !== 'object' || manager === null) return undefined;
    const getFile: unknown = Reflect.get(manager, 'getSessionFile');
    const file: unknown = typeof getFile === 'function' ? getFile.call(manager) : undefined;
    return typeof file === 'string' && file.startsWith('/') ? file : undefined;
  } catch {
    return undefined;
  }
};

export const commsSession = (
  pi: PiEvents,
  env: Readonly<Record<string, string | undefined>>,
): void => {
  const where = hcTerminalOf(env);
  if (where === undefined) return;
  pi.on('session_start', async (_event, ctx) => {
    const session = sessionFileOf(ctx);
    if (session !== undefined) await labelSession({ ...where, session });
  });
};

export default (pi: PiEvents) => commsSession(pi, process.env);
