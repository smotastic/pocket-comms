import type { Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import lockfile from 'proper-lockfile';

// Pi's own store lives in `pi-coding-agent`, which this service does not use (ADR 0012). This one
// keeps Pi's file format and takes Pi's lock, so the Pi CLI and the comms server share one login.

const expandHome = (path: string) =>
  path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path;

/**
 * Pi's credential file: `file` when configured, otherwise `auth.json` in Pi's agent directory
 * (`agentDir`, Pi's `PI_CODING_AGENT_DIR`, or `~/.pi/agent`). A leading `~` is the home directory.
 */
export const piAuthFilePath = (where: {
  readonly file?: string | undefined;
  readonly agentDir?: string | undefined;
}) =>
  expandHome(where.file ?? join(where.agentDir ?? join(homedir(), '.pi', 'agent'), 'auth.json'));

/** Pi's lock on its credential file: a `.lock` directory next to it, stale after 30 seconds. */
const LOCK_STALE_MS = 30_000;
// Waits a little longer than a stale lock lives, backing off to a second between tries.
const LOCK_WAIT_MS = LOCK_STALE_MS + 5_000;
const LOCK_MAX_DELAY_MS = 1_000;

// Pi writes the file in place, so a read can meet it empty or half written for a moment.
const READ_TRIES = 5;
const READ_RETRY_MS = 20;

// The mode applies only when the file is created, as Pi does.
const WRITE_OPTIONS = { encoding: 'utf-8', mode: 0o600 } as const;

/** The file as stored: entries this store does not understand are kept, never dropped. */
type Entries = Record<string, unknown>;

const isCredential = (value: unknown): value is Credential =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  (value.type === 'oauth' || value.type === 'api_key');

/** Waits `ms`; a cancelled wait fails with the reason it was cancelled for. */
const pause = (ms: number, signal?: AbortSignal) =>
  sleep(ms, undefined, signal === undefined ? undefined : { signal }).catch((error: unknown) => {
    signal?.throwIfAborted();
    throw error;
  });

const codeOf = (error: unknown) =>
  error instanceof Error && 'code' in error ? error.code : undefined;

const parse = (path: string, text: string): Entries => {
  const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error(`Invalid Pi credential file ${path}: expected an object.`);
  return { ...parsed };
};

const loadOnce = async (path: string): Promise<Entries> => {
  try {
    return parse(path, await readFile(path, 'utf-8'));
  } catch (error) {
    if (codeOf(error) === 'ENOENT') return {};
    throw error;
  }
};

/** Reads without the lock, trying again while the file is not yet whole JSON. */
const loadUnlocked = async (path: string, signal?: AbortSignal): Promise<Entries> => {
  for (let tries = 1; ; tries++) {
    signal?.throwIfAborted();
    try {
      return await loadOnce(path);
    } catch (error) {
      if (!(error instanceof SyntaxError) || tries === READ_TRIES) throw error;
      await pause(READ_RETRY_MS, signal);
    }
  }
};

const credentialOf = (path: string, entries: Entries, providerId: string) => {
  const entry = entries[providerId];
  if (entry === undefined) return undefined;
  if (!isCredential(entry))
    throw new Error(`Invalid Pi credential file ${path}: the entry of "${providerId}".`);
  return entry;
};

/** Takes Pi's lock, waiting with backoff for another holder; a cancelled wait gives up. */
const acquire = async (
  path: string,
  onCompromised: (error: Error) => void,
  signal?: AbortSignal,
) => {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (let retry = 0; ; retry++) {
    signal?.throwIfAborted();
    try {
      const release = await lockfile.lock(path, {
        realpath: false,
        retries: 0,
        stale: LOCK_STALE_MS,
        onCompromised,
      });
      if (signal?.aborted) {
        await release();
        signal.throwIfAborted();
      }
      return release;
    } catch (error) {
      const remaining = deadline - Date.now();
      if (codeOf(error) !== 'ELOCKED' || remaining <= 0) throw error;
      const delay = Math.min(10 * 2 ** retry, LOCK_MAX_DELAY_MS / 2) * (1 + Math.random());
      await pause(Math.min(Math.round(delay), remaining), signal);
    }
  }
};

/**
 * pi-ai's `CredentialStore` over Pi's `auth.json` (spec 013, requirement 19). Reads take no lock;
 * a write (an OAuth refresh, made by pi-ai under `modify`) re-reads the file under Pi's lock and
 * writes it back whole, so neither the Pi CLI nor the comms server overwrites the other's token.
 */
export const makePiAuthFile = (path: string): CredentialStore => {
  const locked = async <A>(
    change: (entries: Entries) => Promise<{ readonly result: A; readonly next?: Entries }>,
    signal?: AbortSignal,
  ): Promise<A> => {
    signal?.throwIfAborted();
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    let compromised: Error | undefined;
    const throwIfCompromised = () => {
      if (compromised !== undefined) throw compromised;
    };
    const release = await acquire(
      path,
      (error) => {
        compromised = error;
      },
      signal,
    );
    try {
      const { result, next } = await change(await loadOnce(path));
      throwIfCompromised();
      if (next !== undefined) {
        await writeFile(path, JSON.stringify(next, null, 2), WRITE_OPTIONS);
        // Lost meanwhile, another writer may have written its own token: say so, as Pi does.
        throwIfCompromised();
      }
      return result;
    } finally {
      await release().catch(() => undefined);
    }
  };

  return {
    read: async (providerId, options) =>
      credentialOf(path, await loadUnlocked(path, options?.signal), providerId),
    list: async (options) =>
      Object.entries(await loadUnlocked(path, options?.signal)).flatMap(
        ([providerId, entry]): ReadonlyArray<CredentialInfo> =>
          isCredential(entry) ? [{ providerId, type: entry.type }] : [],
      ),
    modify: (providerId, fn, options) =>
      locked(async (entries) => {
        const current = credentialOf(path, entries, providerId);
        const changed = await fn(current);
        return changed === undefined
          ? { result: current }
          : { result: changed, next: { ...entries, [providerId]: changed } };
      }, options?.signal),
    delete: (providerId, options) =>
      locked(async (entries) => {
        if (!(providerId in entries)) return { result: undefined };
        const { [providerId]: _removed, ...rest } = entries;
        return { result: undefined, next: rest };
      }, options?.signal),
  };
};
