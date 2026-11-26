import {
  ConversationOutbound,
  ConversationUnavailableError,
  type SubagentMeta,
  type ConversationSource,
} from '@pocket-comms/comms-application';
import { runningAt, type BackgroundItem, type ConversationEntry } from '@pocket-comms/comms-domain';
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
import { claudeSessionPath, createClaudeParser, waitingCallOf } from './claude.js';
import { stringField, type ToolEntry, type ConversationParser } from './entries.js';
import { createPiParser, piSessionFolder, piSessionId } from './pi.js';

export interface FilesOptions {
  /** The home folder that holds `.claude/` and `.pi/`. */
  readonly home: string;
  /** How many of the latest entries `read` returns. Default 300 (spec 004, requirement 8). */
  readonly maxEntries?: number;
  /** How often `follow` checks the file for new lines. Default 500 ms. */
  readonly pollInterval?: Duration.Input;
  /**
   * The folder where the server's Claude hook keeps each session's waiting `AskUserQuestion`
   * call, which Claude writes to the session file only once it is answered. None leaves it out.
   */
  readonly questions?: string;
}

const parserFor = (source: ConversationSource): ConversationParser =>
  source.format === 'claude'
    ? createClaudeParser(source.cwd, { sidechain: source.subagent !== undefined })
    : createPiParser(source.cwd);

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

const SUBAGENT_ID = /^[a-z0-9]{1,64}$/u;
const SESSION_ID = /^[A-Za-z0-9-]{1,128}$/u;
const META_FILE = /^agent-([a-z0-9]{1,64})\.meta\.json$/u;

// Claude keeps a subagent's files next to its session: `<session>/subagents/agent-<id>.*`.
const subagentsFolder = (sessionPath: string) =>
  join(dirname(sessionPath), basename(sessionPath, '.jsonl'), 'subagents');

const readJson = (path: string): Promise<unknown> =>
  readFile(path, 'utf8')
    .then((text): unknown => JSON.parse(text))
    .catch(() => undefined);

// The meta file names the call that started a subagent, before the call's result does.
const subagentIds = async (sessionPath: string): Promise<ReadonlyMap<string, string>> => {
  const folder = subagentsFolder(sessionPath);
  const names = await readdir(folder).catch(() => []);
  const ids = new Map<string, string>();
  for (const name of names) {
    const id = META_FILE.exec(name)?.[1];
    if (id === undefined) continue;
    const toolUseId = stringField(await readJson(join(folder, name)), 'toolUseId');
    if (toolUseId !== undefined) ids.set(toolUseId, id);
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
export const layerFiles = ({
  home,
  maxEntries = 300,
  pollInterval = '500 millis',
  questions,
}: FilesOptions) =>
  Layer.sync(ConversationOutbound, () => {
    // A session file never moves, so a path once found is kept.
    const found = new Map<string, string>();

    // A subagent's conversation lies next to its session's file, under an id of its own.
    const find = async (source: ConversationSource): Promise<string | undefined> => {
      const session = await findSession(source);
      if (source.subagent === undefined || session === undefined) return session;
      if (!SUBAGENT_ID.test(source.subagent)) return undefined;
      const path = join(subagentsFolder(session), `agent-${source.subagent}.jsonl`);
      return existsSync(path) ? path : undefined;
    };

    const findSession = async (source: ConversationSource): Promise<string | undefined> => {
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
                join(home, '.claude', 'planets'),
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

    const locate = (source: ConversationSource) =>
      Effect.promise(() => find(source)).pipe(
        Effect.flatMap((path) =>
          path === undefined
            ? Effect.fail(
                new ConversationUnavailableError({
                  ref: source.ref,
                  reason: `No session file for session ${source.session}.`,
                }),
              )
            : Effect.succeed(path),
        ),
      );

    // The session's waiting call, unless the session file holds it already: once answered or
    // cancelled the call is there, and a hook file left behind no longer counts.
    const waitingCall = async (
      source: ConversationSource,
      parser: ConversationParser,
    ): Promise<ToolEntry | undefined> => {
      if (questions === undefined || source.format !== 'claude' || source.subagent !== undefined) {
        return undefined;
      }
      if (!SESSION_ID.test(source.session)) return undefined;
      const path = join(questions, `${source.session}.json`);
      const [file, info] = await Promise.all([readJson(path), stat(path).catch(() => undefined)]);
      if (info === undefined) return undefined;
      const call = waitingCallOf(source.cwd, source.session, file, Math.floor(info.mtimeMs));
      if (call === undefined || parser.entries().some((entry) => entry.id === call.id)) {
        return undefined;
      }
      return call;
    };

    const withWaiting = async (source: ConversationSource, parser: ConversationParser) => {
      const call = await waitingCall(source, parser);
      const entries = parser.entries();
      return (call === undefined ? entries : [...entries, call]).slice(-maxEntries);
    };

    const failed = (source: ConversationSource) => (cause: unknown) =>
      new ConversationUnavailableError({
        ref: source.ref,
        reason: cause instanceof Error ? cause.message : 'The session file cannot be read.',
      });

    const read = Effect.fn('Conversation.read')(function* (source: ConversationSource) {
      const path = yield* locate(source);
      const [text, info] = yield* Effect.tryPromise({
        try: () => Promise.all([readFile(path, 'utf8'), stat(path)]),
        catch: failed(source),
      });
      const parser = parserFor(source);
      for (const line of text.split('\n')) parser.push(line);
      const entries = yield* Effect.promise(() => withWaiting(source, parser));
      return { entries, modifiedAt: Math.floor(info.mtimeMs) };
    });

    // Emits the latest entries, then reads what was appended since `offset`. Only complete lines
    // are parsed; a line still being written is read again at the next check, once it is whole. A
    // file that is missing or cannot be read yet is tried again at every check.
    const follow = (source: ConversationSource) =>
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
          // The waiting call emitted last, so each is emitted once.
          let shown: string | undefined;
          const initialEntries = yield* Effect.promise(() => withWaiting(source, parser));
          const initialCall = initialEntries.at(-1);
          if (initialCall?.type === 'tool' && initialCall.outcome === 'pending') {
            shown = initialCall.id;
          }

          const readNew = Effect.tryPromise({
            try: async () => {
              const appended = await readAppended(path, offset);
              offset = appended.offset;
              const changed = new Map<string, ConversationEntry>();
              for (const line of appended.lines) {
                for (const entry of parser.push(line)) changed.set(entry.id, entry);
              }
              const call = await waitingCall(source, parser);
              if (call !== undefined && call.id !== shown) {
                shown = call.id;
                changed.set(call.id, call);
              }
              return [...changed.values()];
            },
            catch: failed(source),
          });

          // A failed check (a file briefly locked or rotated) is logged and retried at the next one.
          const check = readNew.pipe(
            Effect.catchTag('ConversationUnavailableError', (error) =>
              Effect.logWarning('The session file cannot be read', { reason: error.reason }).pipe(
                Effect.as([]),
              ),
            ),
          );

          return Stream.concat(
            Stream.succeed(initialEntries),
            Stream.tick(pollInterval).pipe(
              Stream.mapEffect(() => check),
              Stream.filter((entries) => entries.length > 0),
            ),
          );
        }),
      );

    const modifiedAt = (source: ConversationSource) =>
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
    const tracked = new Map<
      string,
      { parser: ConversationParser; offset: number; usedAt: number }
    >();
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

    const background = Effect.fn('Conversation.background')(function* (source: ConversationSource) {
      if (source.format !== 'claude') return [];
      const path = yield* locate(source);
      const now = yield* Clock.currentTimeMillis;
      for (const [key, state] of tracked) {
        if (now - state.usedAt > TRACKED_FOR_MS) tracked.delete(key);
      }
      // What `take` reads from a file's parser once it has every line appended since the last
      // read of that file, within the same turn.
      const parsedFrom = <A>(
        file: string,
        parserOf: () => ConversationParser,
        take: (parser: ConversationParser) => A,
      ) =>
        inTurn(file, async () => {
          const fresh = () => ({ parser: parserOf(), offset: 0, usedAt: now });
          let state = tracked.get(file) ?? fresh();
          let appended = await readAppended(file, state.offset);
          // Session files only grow; one shorter than what was read was rewritten, so it is read
          // again from its start.
          if (appended.size < state.offset) {
            state = fresh();
            appended = await readAppended(file, 0);
          }
          for (const line of appended.lines) state.parser.push(line);
          tracked.set(file, { ...state, offset: appended.offset, usedAt: now });
          return take(state.parser);
        });
      // A subagent that stopped while its own work goes on still runs while its own file shows
      // that work, or once the file goes on after it stopped: then it resumed by itself.
      const stillRuns = async (subagent: string, since: number) => {
        const file = join(subagentsFolder(path), `agent-${subagent}.jsonl`);
        const info = await stat(file).catch(() => undefined);
        if (info === undefined) return false;
        if (info.mtimeMs > since) return true;
        const own = await parsedFrom(
          file,
          () => createClaudeParser(source.cwd, { sidechain: true }),
          (parser) => parser.background(),
        );
        return runningAt(own, now).length > 0;
      };
      const items = yield* Effect.tryPromise({
        try: async (): Promise<ReadonlyArray<BackgroundItem>> => {
          const { background, waiting } = await parsedFrom(
            path,
            () => parserFor(source),
            (parser) => ({ background: parser.background(), waiting: parser.waiting() }),
          );
          const ended = new Set<string>();
          for (const [subagent, since] of waiting) {
            if (SUBAGENT_ID.test(subagent) && !(await stillRuns(subagent, since))) {
              ended.add(subagent);
            }
          }
          const items = background.filter(
            (item) => item.subagent === undefined || !ended.has(item.subagent),
          );
          if (items.every((item) => item.kind !== 'subagent' || item.subagent !== undefined)) {
            return items;
          }
          const ids = await subagentIds(path);
          return items.map((item) => {
            const subagent =
              item.kind === 'subagent' ? (item.subagent ?? ids.get(item.id)) : undefined;
            return subagent === undefined ? item : { ...item, subagent };
          });
        },
        catch: failed(source),
      });
      return items;
    });

    const subagentMeta = (source: ConversationSource) =>
      Effect.promise(async () => {
        const session = await findSession(source);
        const id = source.subagent;
        if (session === undefined || id === undefined || !SUBAGENT_ID.test(id)) {
          return Option.none<SubagentMeta>();
        }
        const meta = await readJson(join(subagentsFolder(session), `agent-${id}.meta.json`));
        const description = stringField(meta, 'description');
        if (description === undefined) return Option.none<SubagentMeta>();
        return Option.some<SubagentMeta>({
          description,
          agentType: stringField(meta, 'agentType'),
          inBackground: stringField(meta, 'requestShape') !== 'foreground',
        });
      });

    return ConversationOutbound.of({ read, follow, modifiedAt, background, subagentMeta });
  });
