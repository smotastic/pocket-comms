/**
 * What the mission status line (`mission-statusline.ts`, spec 038) does with Claude's status JSON:
 * it keeps the reset time of a reached usage limit for the server, and words a short status line.
 * Claude Code passes the status line its `rate_limits`, per window the `used_percentage` and the
 * `resets_at` in Unix seconds, as pocket-mission's status line read them.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SESSION = /^[A-Za-z0-9-]{1,100}$/u;

interface Window {
  readonly used: number;
  readonly resets: number;
}

const windowsOf = (status: Record<string, unknown>): ReadonlyMap<string, Window> => {
  const limits = status['rate_limits'];
  const windows = new Map<string, Window>();
  if (typeof limits !== 'object' || limits === null) return windows;
  for (const [name, value] of Object.entries(limits)) {
    if (typeof value !== 'object' || value === null) continue;
    const used: unknown = (value as Record<string, unknown>)['used_percentage'];
    const resets: unknown = (value as Record<string, unknown>)['resets_at'];
    if (typeof used === 'number' && typeof resets === 'number') {
      windows.set(name, { used, resets });
    }
  }
  return windows;
};

/**
 * The latest reset of a reached limit (a window used to 100 % or more), in Unix seconds; none
 * when no limit is reached.
 */
export const limitedUntil = (status: Record<string, unknown>): number | undefined => {
  const reached = [...windowsOf(status).values()]
    .filter((window) => window.used >= 100 && window.resets > 0)
    .map((window) => Math.floor(window.resets));
  return reached.length === 0 ? undefined : Math.max(...reached);
};

/**
 * Keeps the conversation's limit in `folder` as `<session>.json`, or removes it when none is
 * reached, and answers the status line to print. Input that does not read changes nothing.
 */
export const handleStatus = (input: string, folder: string): string => {
  let status: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(input);
    if (typeof parsed !== 'object' || parsed === null) return 'mission';
    status = parsed as Record<string, unknown>;
  } catch {
    return 'mission';
  }
  const session = status['session_id'];
  if (typeof session === 'string' && SESSION.test(session)) {
    const path = join(folder, `${session}.json`);
    const until = limitedUntil(status);
    if (until === undefined) {
      rmSync(path, { force: true });
    } else {
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      writeFileSync(path, JSON.stringify({ until }), { encoding: 'utf-8', mode: 0o600 });
    }
  }
  const model = status['model'];
  const name =
    typeof model === 'object' && model !== null
      ? (model as Record<string, unknown>)['display_name']
      : undefined;
  const windows = windowsOf(status);
  const used = (key: string, label: string) => {
    const window = windows.get(key);
    return window === undefined ? [] : [`${label} ${Math.floor(window.used)}%`];
  };
  return [
    'mission',
    ...(typeof name === 'string' ? [name] : []),
    ...used('five_hour', '5h'),
    ...used('seven_day', '7d'),
  ].join(' · ');
};
