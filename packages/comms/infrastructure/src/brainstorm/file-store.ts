import { BrainstormStoreOutbound, type StoredChat } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The brainstorm chat as one JSON file in the server's state folder (spec 013, requirement 5).
// A write goes to a temporary file first and is renamed over the old one, so a crash never
// leaves half a chat behind.

const FILE = 'brainstorm.json';

const Text = { id: Schema.String, at: Schema.Number };

const ProposalState = Schema.Union([
  Schema.Struct({ _tag: Schema.tag('open') }),
  Schema.Struct({ _tag: Schema.tag('created'), number: Schema.Int, url: Schema.String }),
  Schema.Struct({ _tag: Schema.tag('discarded') }),
]);

const EditState = Schema.Union([
  Schema.Struct({ _tag: Schema.tag('open') }),
  Schema.Struct({ _tag: Schema.tag('updated'), url: Schema.String }),
  Schema.Struct({ _tag: Schema.tag('discarded') }),
]);

const IssueFields = {
  type: Schema.tag('proposal'),
  ...Text,
  project: Schema.String,
  title: Schema.String,
  body: Schema.String,
  state: ProposalState,
};

const User = Schema.Struct({ type: Schema.tag('user'), ...Text, text: Schema.String });
const Assistant = Schema.Struct({ type: Schema.tag('assistant'), ...Text, text: Schema.String });
const Failed = Schema.Struct({ type: Schema.tag('failed'), ...Text, reason: Schema.String });

const Entry = Schema.Union([
  User,
  Assistant,
  Schema.Struct({ ...IssueFields, kind: Schema.tag('issue') }),
  Schema.Struct({
    type: Schema.tag('proposal'),
    kind: Schema.tag('edit'),
    ...Text,
    project: Schema.String,
    number: Schema.Int,
    url: Schema.String,
    title: Schema.String,
    body: Schema.String,
    base: Schema.Struct({ title: Schema.String, body: Schema.String }),
    state: EditState,
  }),
  Failed,
]);

const Read = Schema.Struct({
  project: Schema.String,
  number: Schema.Int,
  url: Schema.String,
  title: Schema.String,
  body: Schema.String,
  cut: Schema.Boolean,
});

const Runtime = Schema.NullOr(Schema.Struct({ adapter: Schema.String, state: Schema.Json }));

const StoredFile = Schema.Struct({
  version: Schema.Literal(2),
  id: Schema.String,
  entries: Schema.Array(Entry),
  reads: Schema.Array(Read),
  runtime: Runtime,
});

/** A file from before issue edits: every proposal is a new issue, and no issue was read. */
const StoredFileV1 = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.String,
  entries: Schema.Array(Schema.Union([User, Assistant, Schema.Struct(IssueFields), Failed])),
  runtime: Runtime,
});

const decode = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Union([StoredFile, StoredFileV1])),
);

const toChat = (stored: typeof StoredFile.Type | typeof StoredFileV1.Type): StoredChat => ({
  id: stored.id,
  entries:
    stored.version === 2
      ? stored.entries
      : stored.entries.map((entry) =>
          entry.type === 'proposal' ? { ...entry, kind: 'issue' as const } : entry,
        ),
  reads: stored.version === 2 ? stored.reads : [],
  runtime: Option.fromNullishOr(stored.runtime),
});

const codeOf = (error: unknown) =>
  error instanceof Error && 'code' in error ? error.code : undefined;

export interface FileStoreOptions {
  /** The server's state folder, such as `~/.pocket-comms`; it is created when missing. */
  readonly folder: string;
}

export const layerFile = ({ folder }: FileStoreOptions) => {
  const path = join(folder, FILE);

  // A file that does not read is kept as `.bad`, so the owner can still look at it.
  const load = Effect.gen(function* () {
    const text = yield* Effect.tryPromise(() => readFile(path, 'utf-8')).pipe(
      Effect.catch((error) =>
        codeOf(error.cause) === 'ENOENT'
          ? Effect.succeed(undefined)
          : Effect.logWarning('The brainstorm chat cannot be read').pipe(
              Effect.annotateLogs({ path, error: String(error.cause) }),
              Effect.as(undefined),
            ),
      ),
    );
    if (text === undefined) return Option.none<StoredChat>();
    const stored = decode(text);
    if (Option.isNone(stored)) {
      yield* Effect.logWarning('The stored brainstorm chat is unreadable; it is kept as .bad').pipe(
        Effect.annotateLogs({ path }),
      );
      yield* Effect.promise(() => rename(path, `${path}.bad`).catch(() => undefined));
      return Option.none<StoredChat>();
    }
    return Option.some(toChat(stored.value));
  }).pipe(Effect.withSpan('Brainstorm.load'));

  const save = (chat: StoredChat) =>
    Effect.tryPromise(async () => {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const file: typeof StoredFile.Encoded = {
        version: 2,
        id: chat.id,
        entries: chat.entries,
        reads: chat.reads,
        runtime: Option.getOrNull(chat.runtime),
      };
      // A name of its own per save, so a slower earlier save never renames over a later one's file.
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(file), { encoding: 'utf-8', mode: 0o600 });
      await rename(temporary, path);
    }).pipe(
      Effect.catch((error) =>
        Effect.logError('The brainstorm chat was not saved').pipe(
          Effect.annotateLogs({ path, error: String(error.cause) }),
        ),
      ),
      Effect.withSpan('Brainstorm.save'),
    );

  return Layer.succeed(BrainstormStoreOutbound, BrainstormStoreOutbound.of({ load, save }));
};
