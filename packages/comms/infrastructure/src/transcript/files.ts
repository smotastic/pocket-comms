import {
  TranscriptOutbound,
  TranscriptUnavailableError,
  type TranscriptSource,
} from '@pocket-comms/comms-application';
import type { BackgroundItem, TranscriptEntry } from '@pocket-comms/comms-domain';
import * as Clock from 'effect/Clock';
import type * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schedule from 'effect/Schedule';
import * as Stream from 'effect/Stream';
import { existsSync } from 'node:fs';
import { open, readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { claudeSessionPath, createClaudeParser } from './claude.js';
import type { TranscriptParser } from './entries.js';
import { createPiParser, piSessionFolder, piSessionId } from './pi.js';

export interface FilesOptions {
  /** The home folder that holds `.claude/` and `.pi/`. */
  readonly home: string;
  /** How many of the latest entries `read` returns. Default 300 (spec 004, requirement 8). */
  readonly maxEntries?: number;
  /** How often `follow` checks the file for new lines. Default 500 ms. */
  readonly pollInterval?: Duration.Input;
}

const parserFor = (source: TranscriptSource): TranscriptParser =>
  source.format === 'claude' ? createClaudeParser(source.cwd) : createPiParser(source.cwd);

// How long the background state of a session no one asked about is kept.
const TRACKED_FOR_MS = 10 * 60_000;

// The complete lines appended to a file since `offset`, and the offset after them. A line still
// being written is left for the next read, once it is whole.
const readAppended = async (path: string, offset: number) => {
  const { size } = await stat(path);
  if (size <= offset) return { lines: [], offset, size };
  const handle = await open(path, 'r');
  try {
    const chunk = Buffer.alloc(size - offset);
    await handle.read(chunk, 0, chunk.length, offset);
    const complete = chunk.lastIndexOf(0x0a) + 1;
    return {
      lines: chunk.subarray(0, complete).toString('utf8').split('\n'),
      offset: offset + complete,
      size,
    };
  } finally {
    await handle.close();
  }
};

const META_FILE = /^agent-([a-z0-9]{1,64})\.meta\.json$/u;

// Claude keeps a subagent's files next to its session: `<session>/subagents/agent-<id>.*`. The
// meta file names the call that started it, before the call's result does.
const subagentIds = async (sessionPath: string): Promise<ReadonlyMap<string, string>> => {
  const folder = join(dirname(sessionPath), basename(sessionPath, '.jsonl'), 'subagents');
  const names = await readdir(folder).catch(() => []);
  const ids = new Map<string, string>();
  for (const name of names) {
    const id = META_FILE.exec(name)?.[1];
    if (id === undefined) continue;
    const meta: unknown = await readFile(join(folder, name), 'utf8')
      .then((text) => JSON.parse(text))
      .catch(() => undefined);
    const toolUseId =
      typeof meta === 'object' && meta !== null ? Reflect.get(meta, 'toolUseId') : undefined;
    if (typeof toolUseId === 'string') ids.set(toolUseId, id);
  }
  return ids;
};

// The first folder below `root` that holds a file `matches` accepts, or none.
const search = async (root: string, matches: (name: string) => boolean) => {
  const folders = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const names = await readdir(join(root, folder.name)).catch(() => []);
    const name = names.find(matches);
    if (name !== undefined) return join(root, folder.name, name);
  }
  return undefined;
};

/** The session files of Claude and Pi agents below `home`, read and followed by polling. */
export const layerFiles = ({ home, maxEntries = 300, pollInterval = '500 millis' }: FilesOptions) =>
  Layer.sync(TranscriptOutbound, () => {
    // A session file never moves, so a path once found is kept.
    const found = new Map<string, string>();

    const find = async (source: TranscriptSource): Promise<string | undefined> => {
      const key = `${source.format}:${source.session}`;
      const known = found.get(key);
      if (known !== undefined) return known;
      let path: string | undefined;
      if (source.format === 'claude') {
        const expected =
          source.cwd === undefined
            ? undefined
            : claudeSessionPath(home, source.cwd, source.session);
        path =
          expected !== undefined && existsSync(expected)
            ? expected
            : await search(
                join(home, '.claude', 'projects'),
                (name) => name === `${source.session}.jsonl`,
              );
      } else {
        const matches = (name: string) => name.endsWith(`_${piSessionId(source.session)}.jsonl`);
        const folder = source.cwd === undefined ? undefined : piSessionFolder(home, source.cwd);
        const names = folder === undefined ? [] : await readdir(folder).catch(() => []);
        const name = names.find(matches);
        path =
          folder !== undefined && name !== undefined
            ? join(folder, name)
            : await search(join(home, '.pi', 'agent', 'sessions'), matches);
      }
      if (path !== undefined) found.set(key, path);
      return path;
    };

    const locate = (source: TranscriptSource) =>
      Effect.promise(() => find(source)).pipe(
        Effect.flatMap((path) =>
          path === undefined
            ? Effect.fail(
                new TranscriptUnavailableError({
                  ref: source.ref,
                  reason: `No session file for session ${source.session}.`,
                }),
              )
            : Effect.succeed(path),
        ),
      );

    const failed = (source: TranscriptSource) => (cause: unknown) =>
      new TranscriptUnavailableError({
        ref: source.ref,
        reason: cause instanceof Error ? cause.message : 'The session file cannot be read.',
      });

    const read = Effect.fn('Transcript.read')(function* (source: TranscriptSource) {
      const path = yield* locate(source);
      const [text, info] = yield* Effect.tryPromise({
        try: () => Promise.all([readFile(path, 'utf8'), stat(path)]),
        catch: failed(source),
      });
      const parser = parserFor(source);
      for (const line of text.split('\n')) parser.push(line);
      return { entries: parser.entries().slice(-maxEntries), modifiedAt: Math.floor(info.mtimeMs) };
    });

    // Emits the latest entries, then reads what was appended since `offset`. Only complete lines
    // are parsed; a line still being written is read again at the next check, once it is whole. A
    // file that is missing or cannot be read yet is tried again at every check.
    const follow = (source: TranscriptSource) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const { path, initial } = yield* Effect.gen(function* () {
            const found = yield* locate(source);
            const content = yield* Effect.tryPromise({
              try: () => readFile(found),
              catch: failed(source),
            });
            return { path: found, initial: content };
          }).pipe(Effect.retry({ schedule: Schedule.spaced(pollInterval) }));
          const parser = parserFor(source);
          const end = initial.lastIndexOf(0x0a) + 1;
          for (const line of initial.subarray(0, end).toString('utf8').split('\n'))
            parser.push(line);
          let offset = end;

          const readNew = Effect.tryPromise({
            try: async () => {
              const appended = await readAppended(path, offset);
              offset = appended.offset;
              const changed = new Map<string, TranscriptEntry>();
              for (const line of appended.lines) {
                for (const entry of parser.push(line)) changed.set(entry.id, entry);
              }
              return [...changed.values()];
            },
            catch: failed(source),
          });

          // A failed check (a file briefly locked or rotated) is logged and retried at the next one.
          const check = readNew.pipe(
            Effect.catchTag('TranscriptUnavailableError', (error) =>
              Effect.logWarning('The session file cannot be read', { reason: error.reason }).pipe(
                Effect.as([]),
              ),
            ),
          );

          return Stream.concat(
            Stream.succeed(parser.entries().slice(-maxEntries)),
            Stream.tick(pollInterval).pipe(
              Stream.mapEffect(() => check),
              Stream.filter((entries) => entries.length > 0),
            ),
          );
        }),
      );

    const modifiedAt = (source: TranscriptSource) =>
      Effect.promise(async () => {
        const path = await find(source);
        if (path === undefined) return Option.none<number>();
        return stat(path).then(
          (info) => Option.some(Math.floor(info.mtimeMs)),
          () => Option.none<number>(),
        );
      });

    // Background work needs every line since the session started, so each session keeps its
    // parser and how far it has read; later calls read only what was appended.
    const tracked = new Map<string, { parser: TranscriptParser; offset: number; usedAt: number }>();
    // The reads of one session run one after another, so no line reaches its parser twice.
    const reading = new Map<string, Promise<unknown>>();
    const inTurn = <A>(path: string, task: () => Promise<A>): Promise<A> => {
      const next = (reading.get(path) ?? Promise.resolve()).then(task, task);
      reading.set(path, next);
      void next
        .finally(() => {
          if (reading.get(path) === next) reading.delete(path);
        })
        .catch(() => undefined);
      return next;
    };

    const background = Effect.fn('Transcript.background')(function* (source: TranscriptSource) {
      if (source.format !== 'claude') return [];
      const path = yield* locate(source);
      const now = yield* Clock.currentTimeMillis;
      for (const [key, state] of tracked) {
        if (now - state.usedAt > TRACKED_FOR_MS) tracked.delete(key);
      }
      const items = yield* Effect.tryPromise({
        try: () =>
          inTurn(path, async (): Promise<ReadonlyArray<BackgroundItem>> => {
            const fresh = () => ({ parser: parserFor(source), offset: 0, usedAt: now });
            let state = tracked.get(path) ?? fresh();
            let appended = await readAppended(path, state.offset);
            // Session files only grow; one shorter than what was read was rewritten, so it is read
            // again from its start.
            if (appended.size < state.offset) {
              state = fresh();
              appended = await readAppended(path, 0);
            }
            for (const line of appended.lines) state.parser.push(line);
            tracked.set(path, { ...state, offset: appended.offset, usedAt: now });
            const items = state.parser.background();
            if (items.every((item) => item.kind !== 'subagent' || item.subagent !== undefined)) {
              return items;
            }
            const ids = await subagentIds(path);
            return items.map((item) => {
              const subagent =
                item.kind === 'subagent' ? (item.subagent ?? ids.get(item.id)) : undefined;
              return subagent === undefined ? item : { ...item, subagent };
            });
          }),
        catch: failed(source),
      });
      return items;
    });

    return TranscriptOutbound.of({ read, follow, modifiedAt, background });
  });
