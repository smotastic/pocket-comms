import { ActivityStoreOutbound } from '@pocket-comms/comms-application';
import { AgentKey, type ActivityEvent } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as PubSub from 'effect/PubSub';
import * as Schema from 'effect/Schema';
import * as Semaphore from 'effect/Semaphore';
import * as Stream from 'effect/Stream';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The activity timeline as one JSON file in the server's state folder (spec 017). The events live
// in memory and the file is rewritten after each update, through a temporary file and a rename,
// one update at a time, so a crash never leaves half a file and a slow write never undoes a newer.

const FILE = 'activity.json';

// JSON leaves out a field that is `undefined`, so the optional names are optional keys here.
const Subject = Schema.Struct({
  paneId: Schema.String,
  ref: Schema.String,
  name: Schema.optional(Schema.String),
  workspace: Schema.String,
  project: Schema.optional(Schema.String),
  worktree: Schema.optional(Schema.String),
});

const Common = { id: Schema.String, at: Schema.Number, agent: Subject };

const Event = Schema.Union([
  Schema.Struct({ type: Schema.tag('appeared'), ...Common }),
  Schema.Struct({ type: Schema.tag('gone'), ...Common }),
  Schema.Struct({
    type: Schema.tag('status'),
    ...Common,
    status: Schema.Literals(['working', 'blocked', 'done']),
  }),
  Schema.Struct({
    type: Schema.tag('prompt'),
    ...Common,
    excerpt: Schema.String,
    images: Schema.Int,
  }),
  Schema.Struct({ type: Schema.tag('keys'), ...Common, keys: Schema.Array(AgentKey) }),
  Schema.Struct({ type: Schema.tag('typed'), ...Common, excerpt: Schema.String }),
]);

const StoredFile = Schema.Struct({ version: Schema.Literal(1), events: Schema.Array(Event) });

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(StoredFile));

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
          : Effect.logWarning('The activity timeline cannot be read').pipe(
              Effect.annotateLogs({ path, error: String(error.cause) }),
              Effect.as(undefined),
            ),
      ),
    );
    if (text === undefined) return [];
    const stored = decode(text);
    if (Option.isNone(stored)) {
      yield* Effect.logWarning('The kept activity timeline is unreadable; it is kept as .bad').pipe(
        Effect.annotateLogs({ path }),
      );
      yield* Effect.promise(() => rename(path, `${path}.bad`).catch(() => undefined));
      return [];
    }
    return stored.value.events.map(
      ({ agent, ...event }): ActivityEvent => ({
        ...event,
        agent: {
          ...agent,
          name: agent.name,
          project: agent.project,
          worktree: agent.worktree,
        },
      }),
    );
  }).pipe(Effect.withSpan('Activity.load'));

  const save = (events: ReadonlyArray<ActivityEvent>) =>
    Effect.tryPromise(async () => {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const file: typeof StoredFile.Encoded = { version: 1, events };
      const temporary = `${path}.tmp`;
      await writeFile(temporary, JSON.stringify(file), { encoding: 'utf-8', mode: 0o600 });
      await rename(temporary, path);
    }).pipe(
      Effect.catch((error) =>
        Effect.logError('The activity timeline was not saved').pipe(
          Effect.annotateLogs({ path, error: String(error.cause) }),
        ),
      ),
      Effect.withSpan('Activity.save'),
    );

  return Layer.effect(
    ActivityStoreOutbound,
    Effect.gen(function* () {
      let events: ReadonlyArray<ActivityEvent> = yield* load;
      const lock = yield* Semaphore.make(1);
      const changes = yield* PubSub.unbounded<void>();
      return ActivityStoreOutbound.of({
        events: Effect.sync(() => events),
        update: (change) =>
          Effect.gen(function* () {
            events = change(events);
            yield* save(events);
            yield* PubSub.publish(changes, undefined);
          }).pipe(lock.withPermits(1)),
        changes: Stream.fromPubSub(changes),
      });
    }),
  );
};
