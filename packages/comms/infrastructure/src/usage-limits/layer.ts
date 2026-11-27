import { UsageLimitsOutbound } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// The usage limits the missions' Claude reports (spec 038): the mission status line writes, per
// conversation, `<state>/limits/<session id>.json` as `{ "until": <unix seconds> }` while a limit
// is reached, and removes it after. A file that does not read counts as no limit.

/** The folder of the limits below the server's state folder. */
export const LIMITS_FOLDER = 'limits';

const SESSION = /^[A-Za-z0-9-]{1,100}$/u;

export interface UsageLimitsOptions {
  /** The server's state folder, such as `~/.pocket-comms`. */
  readonly stateDir: string;
}

const untilOf = (text: string): number | undefined => {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || !('until' in parsed)) return undefined;
    const until = parsed.until;
    return typeof until === 'number' && Number.isFinite(until) && until > 0
      ? until * 1000
      : undefined;
  } catch {
    return undefined;
  }
};

export const layer = ({ stateDir }: UsageLimitsOptions) =>
  Layer.succeed(
    UsageLimitsOutbound,
    (() => {
      const folder = join(stateDir, LIMITS_FOLDER);
      const limits = Effect.promise(async () => {
        const names = await readdir(folder).catch(() => [] as Array<string>);
        const entries = await Promise.all(
          names
            .filter((name) => name.endsWith('.json') && SESSION.test(name.slice(0, -5)))
            .map(async (name) => {
              const text = await readFile(join(folder, name), 'utf-8').catch(() => '');
              const until = untilOf(text);
              return until === undefined ? [] : [[name.slice(0, -5), until] as const];
            }),
        );
        return new Map(entries.flat()) as ReadonlyMap<string, number>;
      }).pipe(Effect.withSpan('UsageLimits.limits'));
      return UsageLimitsOutbound.of({ limits });
    })(),
  );
