import { BrainstormStoreOutbound, type StoredChat } from '@pocket-comms/comms-application';
import type { BrainstormEntry } from '@pocket-comms/comms-domain';
import type { StoredChatEntry } from '@smotastic/pocket-agent';
import { ChatEntry } from '@smotastic/pocket-agent/chat';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The brainstorm chat as one JSON file in the server's state folder (spec 013, requirement 5),
// its entries numbered in order since version 4 (spec 026). Version 5 names a proposal's images
// `images` where older files say `pictures`; an older file is read and saved again as version 5.
// A write goes to a temporary file first and is renamed over the old one, so a crash never
// leaves half a chat behind.

const FILE = 'brainstorm.json';

const Text = { id: Schema.String, at: Schema.Number };

const ProposalState = Schema.Union([
  Schema.Struct({ _tag: Schema.tag('open') }),
  Schema.Struct({ _tag: Schema.tag('created'), number: Schema.Int, url: Schema.String }),
  Schema.Struct({ _tag: Schema.tag('discarded') }),
  Schema.Struct({ _tag: Schema.tag('attaching'), number: Schema.Int, url: Schema.String }),
]);

const EditState = Schema.Union([
  Schema.Struct({ _tag: Schema.tag('open') }),
  Schema.Struct({ _tag: Schema.tag('updated'), url: Schema.String }),
  Schema.Struct({ _tag: Schema.tag('discarded') }),
]);

const Attached = Schema.Array(Schema.Struct({ image: Schema.String, url: Schema.String }));
const Images = { images: Schema.Array(Schema.String), attached: Attached };
// Versions 3 and 4 name a proposal's images `pictures`.
const Pictures = { pictures: Schema.Array(Schema.String), attached: Attached };
// A chat saved before pictures (version 2 and older) has none of these.
const Ids = Schema.optional(Schema.Array(Schema.String));
const MaybePictures = { pictures: Ids, attached: Schema.optional(Attached) };

const IssueFields = {
  type: Schema.tag('proposal'),
  ...Text,
  project: Schema.String,
  title: Schema.String,
  body: Schema.String,
  state: ProposalState,
};

const User = Schema.Struct({
  type: Schema.tag('user'),
  ...Text,
  text: Schema.String,
  images: Ids,
});
const Assistant = Schema.Struct({ type: Schema.tag('assistant'), ...Text, text: Schema.String });
const Failed = Schema.Struct({ type: Schema.tag('failed'), ...Text, reason: Schema.String });

const issueProposal = <P extends Schema.Struct.Fields>(images: P) =>
  Schema.Struct({ ...IssueFields, ...images, kind: Schema.tag('issue') });
const editProposal = <P extends Schema.Struct.Fields>(images: P) =>
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
    ...images,
    state: EditState,
  });

/** An entry of a chat before the log (versions 2 and 3). */
const Entry = Schema.Union([
  User,
  Assistant,
  issueProposal(MaybePictures),
  editProposal(MaybePictures),
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

/** The chat's own entries in the log, its proposals' images under `images` or `pictures`. */
const ownEntry = <P extends Schema.Struct.Fields>(images: P) =>
  Schema.Union([
    Schema.Struct({
      kind: Schema.tag('said'),
      ...Text,
      text: Schema.String,
      images: Schema.Array(Schema.String),
    }),
    Schema.Struct({
      kind: Schema.tag('proposal'),
      proposal: Schema.Union([issueProposal(images), editProposal(images)]),
    }),
    Schema.Struct({ kind: Schema.tag('chatStarted') }),
  ]);

/** A numbered log of the package's shared entries (`ChatEntry`) and the chat's own. */
const logOfEntries = <P extends Schema.Struct.Fields>(images: P) =>
  Schema.Array(
    Schema.Struct({ sequence: Schema.Int, entry: Schema.Union([ChatEntry, ownEntry(images)]) }),
  );

/** Version 5 names a proposal's images `images`. */
const StoredFileV5 = Schema.Struct({
  version: Schema.Literal(5),
  id: Schema.String,
  log: logOfEntries(Images),
  reads: Schema.Array(Read),
  runtime: Runtime,
});

/** Version 4 numbers the entries, the package's and the chat's own (spec 026). */
const StoredFileV4 = Schema.Struct({
  version: Schema.Literal(4),
  id: Schema.String,
  log: logOfEntries(Pictures),
  reads: Schema.Array(Read),
  runtime: Runtime,
});

/** Version 3 adds the pictures (spec 023); version 2 has none and reads the same way. */
const StoredFile = Schema.Struct({
  version: Schema.Literals([2, 3]),
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
  Schema.fromJsonString(Schema.Union([StoredFileV5, StoredFileV4, StoredFile, StoredFileV1])),
);

type StoredEntry = (typeof StoredFile.Type)['entries'][number];
type LogEntry = StoredChatEntry<BrainstormEntry>['entry'];

/** An entry from before the log as the log holds it, with the images older files lack. */
const asLogEntry = (entry: StoredEntry): LogEntry => {
  switch (entry.type) {
    case 'user':
      return {
        kind: 'said',
        id: entry.id,
        at: entry.at,
        text: entry.text,
        images: entry.images ?? [],
      };
    case 'assistant':
      return { kind: 'agentMessage', text: entry.text };
    case 'failed':
      return { kind: 'turnFailed', reason: entry.reason };
    case 'proposal': {
      const { pictures, attached, ...proposal } = entry;
      return {
        kind: 'proposal',
        proposal: { ...proposal, images: pictures ?? [], attached: attached ?? [] },
      };
    }
  }
};

type V4Entry = (typeof StoredFileV4.Type)['log'][number]['entry'];

/** An entry of version 4 as version 5 holds it: a proposal's `pictures` become its `images`. */
const fromV4 = (entry: V4Entry): LogEntry => {
  if (entry.kind !== 'proposal' || !('proposal' in entry)) return entry;
  const { pictures, ...proposal } = entry.proposal;
  return { kind: 'proposal', proposal: { ...proposal, images: pictures } };
};

type AnyFile =
  | typeof StoredFileV5.Type
  | typeof StoredFileV4.Type
  | typeof StoredFile.Type
  | typeof StoredFileV1.Type;

/** The entries of a file from before the log, numbered from their position (spec 026). */
const logOf = (stored: typeof StoredFile.Type | typeof StoredFileV1.Type) =>
  (stored.version === 1
    ? stored.entries.map((entry) =>
        entry.type === 'proposal' ? { ...entry, kind: 'issue' as const } : entry,
      )
    : stored.entries
  ).map((entry, index) => ({ sequence: index + 1, entry: asLogEntry(entry) }));

const toChat = (stored: AnyFile): StoredChat => ({
  id: stored.id,
  log:
    stored.version === 5
      ? stored.log
      : stored.version === 4
        ? stored.log.map(({ sequence, entry }) => ({ sequence, entry: fromV4(entry) }))
        : logOf(stored),
  reads: stored.version === 1 ? [] : stored.reads,
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
      const file: typeof StoredFileV5.Encoded = {
        version: 5,
        id: chat.id,
        log: chat.log,
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
