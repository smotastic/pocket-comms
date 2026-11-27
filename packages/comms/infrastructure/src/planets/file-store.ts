import { PlanetsOutbound, PlanetsStoreError } from '@pocket-comms/comms-application';
import type { PlanetRegistry } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as PubSub from 'effect/PubSub';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The planets registry (spec 034, ADR 0018) as one JSON file in the server's state folder. A
// write goes to a temporary file that is renamed over the old one. A file that does not read is
// kept as `.bad` and counts as no registry, so the next start seeds a fresh one.

const FILE = 'planets.json';

const StoredFile = Schema.Struct({
  version: Schema.Literal(1),
  // Whether the allowed apps were seeded once (spec 037).
  appsSeeded: Schema.optional(Schema.Boolean),
  planets: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      autonomy: Schema.Literals(['manual', 'missions', 'autopilot']),
      apps: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),
});

// The stored registry must keep every field of the domain's, or a save drops it.
const _keepsEveryField = (registry: PlanetRegistry): Omit<typeof StoredFile.Type, 'version'> =>
  registry;
void _keepsEveryField;

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(StoredFile));

const codeOf = (error: unknown) =>
  error instanceof Error && 'code' in error ? error.code : undefined;

export interface FileStoreOptions {
  /** The server's state folder, such as `~/.pocket-comms`; it is created when missing. */
  readonly folder: string;
}

export const layerFile = ({ folder }: FileStoreOptions) =>
  Layer.effect(
    PlanetsOutbound,
    Effect.gen(function* () {
      const path = join(folder, FILE);
      const changes = yield* PubSub.unbounded<void>();

      const load = Effect.gen(function* () {
        const text = yield* Effect.tryPromise(() => readFile(path, 'utf-8')).pipe(
          Effect.catch((error) =>
            codeOf(error.cause) === 'ENOENT'
              ? Effect.succeed(undefined)
              : Effect.logWarning('The planets cannot be read').pipe(
                  Effect.annotateLogs({ path, error: String(error.cause) }),
                  Effect.as(undefined),
                ),
          ),
        );
        if (text === undefined) return Option.none<PlanetRegistry>();
        const stored = decode(text);
        if (Option.isNone(stored)) {
          yield* Effect.logWarning('The planets file is unreadable; it is kept as .bad').pipe(
            Effect.annotateLogs({ path }),
          );
          yield* Effect.promise(() => rename(path, `${path}.bad`).catch(() => undefined));
          return Option.none<PlanetRegistry>();
        }
        const { version: _version, ...registry } = stored.value;
        return Option.some<PlanetRegistry>(registry);
      }).pipe(Effect.withSpan('Planets.load'));

      const save = (registry: PlanetRegistry) =>
        Effect.tryPromise(async () => {
          await mkdir(folder, { recursive: true, mode: 0o700 });
          const file: typeof StoredFile.Encoded = { version: 1, ...registry };
          // A name of its own per save, so a slower earlier save never renames over a later one.
          const temporary = `${path}.${randomUUID()}.tmp`;
          await writeFile(temporary, JSON.stringify(file), { encoding: 'utf-8', mode: 0o600 });
          await rename(temporary, path);
        }).pipe(
          Effect.mapError(
            (error) =>
              new PlanetsStoreError({
                reason: `${FILE} cannot be written: ${String(error.cause)}`,
              }),
          ),
          Effect.andThen(PubSub.publish(changes, undefined)),
          Effect.asVoid,
          Effect.withSpan('Planets.save'),
        );

      return PlanetsOutbound.of({ load, save, changes: Stream.fromPubSub(changes) });
    }),
  );
