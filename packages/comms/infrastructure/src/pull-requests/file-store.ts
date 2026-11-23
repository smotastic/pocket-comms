import {
  PullRequestsOutbound,
  PullRequestsStoreError,
  type AttachedLists,
} from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The agents' attached pull requests (spec 031) as one JSON file in the server's state folder, by
// the session id of each agent's conversation. A write goes to a temporary file that is renamed
// over the old one. A file that does not read is reported and a read leaves it alone, so only the
// next attach or removal writes over it.

const FILE = 'pull-requests.json';

const Attached = Schema.Struct({
  owner: Schema.String,
  name: Schema.String,
  number: Schema.Int,
  attachedAt: Schema.Number,
});

const StoredFile = Schema.Struct({
  version: Schema.Literal(1),
  agents: Schema.Record(Schema.String, Schema.Array(Attached)),
});

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(StoredFile));

const codeOf = (error: unknown) =>
  error instanceof Error && 'code' in error ? error.code : undefined;

const failure = (reason: string) => new PullRequestsStoreError({ reason });

export interface FileStoreOptions {
  /** The server's state folder, such as `~/.pocket-comms`; it is created when missing. */
  readonly folder: string;
}

export const layerFile = ({ folder }: FileStoreOptions) => {
  const path = join(folder, FILE);

  const load = Effect.gen(function* () {
    const text = yield* Effect.tryPromise(() => readFile(path, 'utf-8')).pipe(
      Effect.catch((error) =>
        codeOf(error.cause) === 'ENOENT'
          ? Effect.succeed(undefined)
          : Effect.fail(failure(`${FILE} cannot be read: ${String(error.cause)}`)),
      ),
    );
    if (text === undefined) return {} satisfies AttachedLists;
    const stored = decode(text);
    if (Option.isNone(stored)) return yield* failure(`${FILE} is not readable`);
    return stored.value.agents as AttachedLists;
  }).pipe(Effect.withSpan('PullRequests.load'));

  const save = (lists: AttachedLists) =>
    Effect.tryPromise(async () => {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const file: typeof StoredFile.Encoded = { version: 1, agents: lists };
      // A name of its own per save, so a slower earlier save never renames over a later one's file.
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(file), { encoding: 'utf-8', mode: 0o600 });
      await rename(temporary, path);
    }).pipe(
      Effect.mapError((error) => failure(`${FILE} cannot be written: ${String(error.cause)}`)),
      Effect.withSpan('PullRequests.save'),
    );

  return Layer.succeed(PullRequestsOutbound, PullRequestsOutbound.of({ load, save }));
};
