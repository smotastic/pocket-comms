import { AutopilotOutbound, AutopilotStoreError } from '@pocket-comms/comms-application';
import {
  EMPTY_AUTOPILOT,
  TRIAGE_VERDICTS,
  type AutopilotFile,
  type AutopilotNight,
  type AutopilotSettings,
  type TriagedIssue,
} from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The Autopilot file (spec 038, ADR 0021) in the server's state folder: the owner's settings,
// what the triage wrote, and the current or last window. A write goes to a temporary file that is
// renamed over the old one. A file that does not read is kept as `.bad` and counts as the defaults.

const FILE = 'autopilot.json';

const optional = <S extends Schema.Top>(schema: S) => Schema.optional(schema);

const Verdict = Schema.Literals(TRIAGE_VERDICTS);

const StoredSettings = Schema.Struct({
  enabled: Schema.Boolean,
  start: Schema.String,
  end: Schema.String,
  budget: Schema.Number,
});

const StoredTriaged = Schema.Struct({
  planet: Schema.String,
  number: Schema.Number,
  hash: Schema.String,
  verdict: Verdict,
});

const StoredNight = Schema.Struct({
  window: Schema.String,
  triaged: Schema.Boolean,
  triage: Schema.Array(
    Schema.Struct({
      planet: Schema.String,
      verdicts: Schema.Array(
        Schema.Struct({
          number: Schema.Number,
          title: Schema.String,
          url: Schema.String,
          verdict: Verdict,
          reason: Schema.String,
        }),
      ),
      skipped: optional(Schema.String),
    }),
  ),
  sent: Schema.Array(Schema.String),
  endings: Schema.Array(Schema.Struct({ id: Schema.String, failed: Schema.Boolean })),
  stopped: optional(Schema.String),
  summarySent: Schema.Boolean,
});

const StoredFile = Schema.Struct({
  version: Schema.Literal(1),
  settings: StoredSettings,
  triaged: Schema.Array(StoredTriaged),
  night: optional(StoredNight),
});

// The stored shape must keep up with the domain's, in both directions, or a field is lost.
const _settings = (settings: AutopilotSettings): typeof StoredSettings.Type => settings;
const _settingsBack = (settings: typeof StoredSettings.Type): AutopilotSettings => settings;
const _triaged = (issue: TriagedIssue): typeof StoredTriaged.Type => issue;
const _triagedBack = (issue: typeof StoredTriaged.Type): TriagedIssue => issue;
const _night = (night: AutopilotNight): typeof StoredNight.Type => night;
const _nightBack = (night: typeof StoredNight.Type): AutopilotNight => night;
void _settings;
void _settingsBack;
void _triaged;
void _triagedBack;
void _night;
void _nightBack;

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(StoredFile));

const codeOf = (error: unknown) =>
  error instanceof Error && 'code' in error ? error.code : undefined;

export interface FileStoreOptions {
  /** The server's state folder, such as `~/.pocket-comms`; it is created when missing. */
  readonly folder: string;
}

export const layerFile = ({ folder }: FileStoreOptions) =>
  Layer.succeed(
    AutopilotOutbound,
    (() => {
      const path = join(folder, FILE);

      const load = Effect.gen(function* () {
        const text = yield* Effect.tryPromise(() => readFile(path, 'utf-8')).pipe(
          Effect.catch((error) =>
            codeOf(error.cause) === 'ENOENT'
              ? Effect.succeed(undefined)
              : Effect.logWarning('The Autopilot file cannot be read').pipe(
                  Effect.annotateLogs({ path, error: String(error.cause) }),
                  Effect.as(undefined),
                ),
          ),
        );
        if (text === undefined) return EMPTY_AUTOPILOT;
        const stored = decode(text);
        if (Option.isNone(stored)) {
          yield* Effect.logWarning('The Autopilot file is unreadable; it is kept as .bad').pipe(
            Effect.annotateLogs({ path }),
          );
          yield* Effect.promise(() => rename(path, `${path}.bad`).catch(() => undefined));
          return EMPTY_AUTOPILOT;
        }
        const { settings, triaged, night } = stored.value;
        return { settings, triaged, night } as AutopilotFile;
      }).pipe(Effect.withSpan('Autopilot.load'));

      const save = (file: AutopilotFile) =>
        Effect.tryPromise(async () => {
          await mkdir(folder, { recursive: true, mode: 0o700 });
          const stored = { version: 1, ...file };
          // A name of its own per save, so a slower earlier save never renames over a later one.
          const temporary = `${path}.${randomUUID()}.tmp`;
          await writeFile(temporary, JSON.stringify(stored), { encoding: 'utf-8', mode: 0o600 });
          await rename(temporary, path);
        }).pipe(
          Effect.mapError(
            (error) =>
              new AutopilotStoreError({
                reason: `${FILE} cannot be written: ${String(error.cause)}`,
              }),
          ),
          Effect.withSpan('Autopilot.save'),
        );

      return AutopilotOutbound.of({ load, save });
    })(),
  );
