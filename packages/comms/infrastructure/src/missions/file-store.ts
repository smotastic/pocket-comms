import { MissionsOutbound, MissionsStoreError } from '@pocket-comms/comms-application';
import { EMPTY_MISSIONS, type MissionsFile } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The mission queue and every mission's state (spec 035, ADR 0019) as one JSON file in the
// server's state folder. A write goes to a temporary file that is renamed over the old one. A file
// that does not read is kept as `.bad` and counts as no missions.

const FILE = 'missions.json';

const optional = <S extends Schema.Top>(schema: S) => Schema.optional(schema);

const StoredMission = Schema.Struct({
  id: Schema.String,
  planet: Schema.String,
  repository: Schema.Struct({ owner: Schema.String, name: Schema.String }),
  issue: Schema.Struct({ number: Schema.Number, title: Schema.String, url: Schema.String }),
  lane: Schema.Literals(['hop', 'full-flight']),
  state: Schema.Literals([
    'queued',
    'working',
    'waiting',
    'pull-request',
    'lost',
    'merged',
    'failed',
    'aborted',
    'held',
  ]),
  sentAt: Schema.Number,
  startedAt: optional(Schema.Number),
  finishedAt: optional(Schema.Number),
  worktree: optional(
    Schema.Struct({ path: Schema.String, branch: Schema.String, workspaceId: Schema.String }),
  ),
  agent: optional(Schema.String),
  session: optional(Schema.String),
  pullRequest: optional(Schema.Struct({ number: Schema.Number, url: Schema.String })),
  outcome: optional(Schema.String),
  reason: optional(Schema.String),
});

const StoredFile = Schema.Struct({
  version: Schema.Literal(1),
  seenAt: Schema.Number,
  missions: Schema.Array(StoredMission),
});

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(StoredFile));

const codeOf = (error: unknown) =>
  error instanceof Error && 'code' in error ? error.code : undefined;

export interface FileStoreOptions {
  /** The server's state folder, such as `~/.pocket-comms`; it is created when missing. */
  readonly folder: string;
}

export const layerFile = ({ folder }: FileStoreOptions) =>
  Layer.succeed(
    MissionsOutbound,
    (() => {
      const path = join(folder, FILE);

      const load = Effect.gen(function* () {
        const text = yield* Effect.tryPromise(() => readFile(path, 'utf-8')).pipe(
          Effect.catch((error) =>
            codeOf(error.cause) === 'ENOENT'
              ? Effect.succeed(undefined)
              : Effect.logWarning('The missions cannot be read').pipe(
                  Effect.annotateLogs({ path, error: String(error.cause) }),
                  Effect.as(undefined),
                ),
          ),
        );
        if (text === undefined) return EMPTY_MISSIONS;
        const stored = decode(text);
        if (Option.isNone(stored)) {
          yield* Effect.logWarning('The missions file is unreadable; it is kept as .bad').pipe(
            Effect.annotateLogs({ path }),
          );
          yield* Effect.promise(() => rename(path, `${path}.bad`).catch(() => undefined));
          return EMPTY_MISSIONS;
        }
        return { seenAt: stored.value.seenAt, missions: stored.value.missions } as MissionsFile;
      }).pipe(Effect.withSpan('Missions.load'));

      const save = (file: MissionsFile) =>
        Effect.tryPromise(async () => {
          await mkdir(folder, { recursive: true, mode: 0o700 });
          const stored = { version: 1, seenAt: file.seenAt, missions: file.missions };
          // A name of its own per save, so a slower earlier save never renames over a later one.
          const temporary = `${path}.${randomUUID()}.tmp`;
          await writeFile(temporary, JSON.stringify(stored), { encoding: 'utf-8', mode: 0o600 });
          await rename(temporary, path);
        }).pipe(
          Effect.mapError(
            (error) =>
              new MissionsStoreError({
                reason: `${FILE} cannot be written: ${String(error.cause)}`,
              }),
          ),
          Effect.withSpan('Missions.save'),
        );

      return MissionsOutbound.of({ load, save });
    })(),
  );
