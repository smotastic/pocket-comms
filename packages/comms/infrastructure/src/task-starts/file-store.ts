import { TaskStartsOutbound, TaskStartsStoreError } from '@pocket-comms/comms-application';
import { AgentToStart, type TaskStart } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import * as Semaphore from 'effect/Semaphore';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The task starts (spec 032) as one JSON file in the server's state folder, by worktree folder.
// Changes run one at a time and write a temporary file that is renamed over the old one. A file
// that does not read is reported and a read leaves it alone; the next change writes over it.

const FILE = 'task-starts.json';

const Stored = Schema.Struct({
  planet: Schema.String,
  branch: Schema.String,
  issue: Schema.optional(Schema.Int),
  kind: AgentToStart,
  agent: Schema.optional(Schema.String),
  prompt: Schema.String,
  delivery: Schema.Literals(['pending', 'not-started', 'not-sent', 'uncertain', 'delivered']),
  reason: Schema.optional(Schema.String),
  at: Schema.Number,
  // The file names the planet `project`, the word from before spec 034.
}).pipe(Schema.encodeKeys({ planet: 'project' }));

const StoredFile = Schema.Struct({
  version: Schema.Literal(1),
  starts: Schema.Record(Schema.String, Stored),
});

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(StoredFile));

const codeOf = (error: unknown) =>
  error instanceof Error && 'code' in error ? error.code : undefined;

const failure = (reason: string) => new TaskStartsStoreError({ reason });

const toStart = (folder: string, stored: typeof Stored.Type): TaskStart => ({
  folder,
  planet: stored.planet,
  branch: stored.branch,
  issue: stored.issue,
  kind: stored.kind,
  agent: stored.agent,
  prompt: stored.prompt,
  delivery: stored.delivery,
  reason: stored.reason,
  at: stored.at,
});

const toStored = ({ folder: _folder, ...start }: TaskStart): typeof Stored.Encoded => ({
  project: start.planet,
  branch: start.branch,
  kind: start.kind,
  prompt: start.prompt,
  delivery: start.delivery,
  at: start.at,
  ...(start.issue === undefined ? {} : { issue: start.issue }),
  ...(start.agent === undefined ? {} : { agent: start.agent }),
  ...(start.reason === undefined ? {} : { reason: start.reason }),
});

export interface FileStoreOptions {
  /** The server's state folder, such as `~/.pocket-comms`; it is created when missing. */
  readonly folder: string;
}

export const layerFile = ({ folder }: FileStoreOptions) =>
  Layer.effect(
    TaskStartsOutbound,
    Effect.gen(function* () {
      const path = join(folder, FILE);
      const changing = yield* Semaphore.make(1);

      const read = Effect.gen(function* () {
        const text = yield* Effect.tryPromise(() => readFile(path, 'utf-8')).pipe(
          Effect.catch((error) =>
            codeOf(error.cause) === 'ENOENT'
              ? Effect.succeed(undefined)
              : Effect.fail(failure(`${FILE} cannot be read: ${String(error.cause)}`)),
          ),
        );
        if (text === undefined) return {};
        const stored = decode(text);
        if (Option.isNone(stored)) return yield* failure(`${FILE} is not readable`);
        return stored.value.starts;
      });

      const write = (starts: Readonly<Record<string, typeof Stored.Encoded>>) =>
        Effect.tryPromise(async () => {
          await mkdir(folder, { recursive: true, mode: 0o700 });
          const file: typeof StoredFile.Encoded = { version: 1, starts };
          const temporary = `${path}.${randomUUID()}.tmp`;
          await writeFile(temporary, JSON.stringify(file), { encoding: 'utf-8', mode: 0o600 });
          await rename(temporary, path);
        }).pipe(
          Effect.mapError((error) => failure(`${FILE} cannot be written: ${String(error.cause)}`)),
        );

      // A broken file holds nothing that can be kept, so a change starts from no starts.
      const change = (
        update: (
          starts: Record<string, typeof Stored.Encoded>,
        ) => Record<string, typeof Stored.Encoded>,
      ) =>
        changing.withPermit(
          read.pipe(
            Effect.map((starts) =>
              Object.fromEntries(
                Object.entries(starts).map(([key, stored]) => [
                  key,
                  toStored(toStart(key, stored)),
                ]),
              ),
            ),
            Effect.orElseSucceed(() => ({})),
            Effect.flatMap((starts) => write(update(starts))),
          ),
        );

      return TaskStartsOutbound.of({
        load: read.pipe(
          Effect.map((starts) =>
            Object.entries(starts).map(([key, stored]) => toStart(key, stored)),
          ),
          Effect.withSpan('TaskStarts.load'),
        ),
        put: (start) =>
          change((starts) => ({ ...starts, [start.folder]: toStored(start) })).pipe(
            Effect.withSpan('TaskStarts.put'),
          ),
        forget: (key) =>
          change(({ [key]: _gone, ...others }) => others).pipe(
            Effect.withSpan('TaskStarts.forget'),
          ),
      });
    }),
  );
