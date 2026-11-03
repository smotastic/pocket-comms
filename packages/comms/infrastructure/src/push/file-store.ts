import {
  PushKeysOutbound,
  PushStoreError,
  PushSubscriptionsOutbound,
} from '@pocket-comms/comms-application';
import type { PushSubscription } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import * as Semaphore from 'effect/Semaphore';
import { createECDH, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The push devices and the server's VAPID keys, as two JSON files in `push/` of the state
// folder. Writes go to a temporary file that is renamed over the old one, and a file that does
// not read is reported and left alone: overwriting it would lose the devices or the keys.

const SUBSCRIPTIONS = 'subscriptions.json';
const KEYS = 'vapid.json';

const StoredSubscriptions = Schema.Struct({
  version: Schema.Literal(1),
  subscriptions: Schema.Array(
    Schema.Struct({
      endpoint: Schema.String,
      keys: Schema.Struct({ p256dh: Schema.String, auth: Schema.String }),
    }),
  ),
});

const StoredKeys = Schema.Struct({
  version: Schema.Literal(1),
  publicKey: Schema.String,
  privateKey: Schema.String,
});

const decodeSubscriptions = Schema.decodeUnknownOption(Schema.fromJsonString(StoredSubscriptions));
const decodeKeys = Schema.decodeUnknownOption(Schema.fromJsonString(StoredKeys));

/** The server's VAPID key pair, base64url: the public key as an uncompressed P-256 point. */
export interface Vapid {
  readonly publicKey: string;
  readonly privateKey: string;
}

/** The full key pair, for the sender only; the application sees the public key alone. */
export class VapidKeys extends Context.Service<
  VapidKeys,
  { readonly keys: Effect.Effect<Vapid, PushStoreError> }
>()('comms/infrastructure/push/VapidKeys') {}

export interface PushFileStoreOptions {
  /** The server's state folder, such as `~/.pocket-comms`; `push/` is created when missing. */
  readonly stateDir: string;
}

const codeOf = (error: unknown) =>
  error instanceof Error && 'code' in error ? error.code : undefined;

const failure = (reason: string) => new PushStoreError({ reason });

const PRIVATE_KEY_BYTES = 32;
const PUBLIC_KEY_BYTES = 65;

/**
 * The private key as base64url of exactly 32 bytes: Node drops its leading zero bytes, and
 * web-push refuses a key of any other length.
 */
export const privateKeyOf = (raw: Buffer): string =>
  Buffer.concat([Buffer.alloc(Math.max(0, PRIVATE_KEY_BYTES - raw.length)), raw]).toString(
    'base64url',
  );

const hasLengths = (keys: Vapid) =>
  Buffer.from(keys.publicKey, 'base64url').length === PUBLIC_KEY_BYTES &&
  Buffer.from(keys.privateKey, 'base64url').length === PRIVATE_KEY_BYTES;

export const layerFile = ({ stateDir }: PushFileStoreOptions) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const folder = join(stateDir, 'push');
      // One writer at a time, so two changes never both start from the same old file.
      const lock = yield* Semaphore.make(1);

      /** The file's text, or none when there is no file yet. */
      const read = (name: string) =>
        Effect.tryPromise(() => readFile(join(folder, name), 'utf-8')).pipe(
          Effect.map(Option.some),
          Effect.catch((error) =>
            codeOf(error.cause) === 'ENOENT'
              ? Effect.succeed(Option.none<string>())
              : Effect.fail(failure(`${name} cannot be read: ${String(error.cause)}`)),
          ),
        );

      const write = (name: string, value: unknown) =>
        Effect.tryPromise(async () => {
          await mkdir(folder, { recursive: true, mode: 0o700 });
          // `mkdir` leaves the mode of a folder that already exists, and the keys live here.
          await chmod(folder, 0o700);
          const temporary = join(folder, `${name}.${randomUUID()}.tmp`);
          await writeFile(temporary, JSON.stringify(value), { encoding: 'utf-8', mode: 0o600 });
          await rename(temporary, join(folder, name));
        }).pipe(
          Effect.mapError((error) => failure(`${name} cannot be written: ${String(error.cause)}`)),
        );

      const load = read(SUBSCRIPTIONS).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed<ReadonlyArray<PushSubscription>>([]),
            onSome: (text) =>
              Option.match(decodeSubscriptions(text), {
                onNone: () => Effect.fail(failure(`${SUBSCRIPTIONS} is not readable`)),
                onSome: (stored) => Effect.succeed(stored.subscriptions),
              }),
          }),
        ),
      );

      const change = (
        update: (kept: ReadonlyArray<PushSubscription>) => ReadonlyArray<PushSubscription>,
      ) =>
        lock.withPermit(
          Effect.gen(function* () {
            const kept = yield* load;
            yield* write(SUBSCRIPTIONS, { version: 1, subscriptions: update(kept) });
          }),
        );

      const subscriptions = PushSubscriptionsOutbound.of({
        list: load.pipe(Effect.withSpan('PushSubscriptions.list')),
        save: (subscription) =>
          change((kept) => [
            ...kept.filter((other) => other.endpoint !== subscription.endpoint),
            subscription,
          ]).pipe(Effect.withSpan('PushSubscriptions.save')),
        remove: (endpoint) =>
          change((kept) => kept.filter((other) => other.endpoint !== endpoint)).pipe(
            Effect.withSpan('PushSubscriptions.remove'),
          ),
      });

      let known: Vapid | undefined;
      const keys = lock
        .withPermit(
          Effect.gen(function* () {
            if (known !== undefined) return known;
            const text = yield* read(KEYS);
            if (Option.isSome(text)) {
              const stored = decodeKeys(text.value);
              if (Option.isNone(stored)) return yield* failure(`${KEYS} is not readable`);
              const kept: Vapid = {
                publicKey: stored.value.publicKey,
                privateKey: stored.value.privateKey,
              };
              if (!hasLengths(kept))
                return yield* failure(`${KEYS} holds keys of the wrong length`);
              known = kept;
              return known;
            }
            const ecdh = createECDH('prime256v1');
            ecdh.generateKeys();
            const made: Vapid = {
              publicKey: ecdh.getPublicKey('base64url', 'uncompressed'),
              privateKey: privateKeyOf(ecdh.getPrivateKey()),
            };
            yield* write(KEYS, { version: 1, ...made });
            yield* Effect.logInfo('Push keys made');
            known = made;
            return made;
          }),
        )
        .pipe(Effect.withSpan('PushKeys.keys'));

      return Context.make(PushSubscriptionsOutbound, subscriptions).pipe(
        Context.add(
          PushKeysOutbound,
          PushKeysOutbound.of({ publicKey: Effect.map(keys, (pair) => pair.publicKey) }),
        ),
        Context.add(VapidKeys, VapidKeys.of({ keys })),
      );
    }),
  );
