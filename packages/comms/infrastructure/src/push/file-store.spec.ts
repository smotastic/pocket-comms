import { describe, expect, it } from '@effect/vitest';
import {
  PushKeysOutbound,
  PushStoreError,
  PushSubscriptionsOutbound,
} from '@pocket-comms/comms-application';
import type { PushSubscription } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFile, privateKeyOf, VapidKeys } from './file-store.js';

const folder = () => join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'state');

const subscription = (name: string): PushSubscription => ({
  endpoint: `https://push.example/${name}`,
  keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` },
});

const services = (stateDir: string) =>
  Effect.all({
    subscriptions: PushSubscriptionsOutbound,
    keys: PushKeysOutbound,
    vapid: VapidKeys,
  }).pipe(Effect.provide(Layer.fresh(layerFile({ stateDir }))));

const base64url = /^[A-Za-z0-9_-]+$/u;

describe('the push file store', () => {
  it.effect('lists no device before the first one subscribes', () =>
    Effect.gen(function* () {
      const { subscriptions } = yield* services(folder());

      expect(yield* subscriptions.list).toEqual([]);
    }),
  );

  it.effect('keeps devices across restarts, one per endpoint, readable by the owner only', () =>
    Effect.gen(function* () {
      const path = folder();
      const { subscriptions } = yield* services(path);

      yield* subscriptions.save(subscription('phone'));
      yield* subscriptions.save(subscription('laptop'));
      yield* subscriptions.save({ ...subscription('phone'), keys: { p256dh: 'new', auth: 'new' } });
      yield* subscriptions.remove(subscription('laptop').endpoint);
      yield* subscriptions.remove('https://push.example/unknown');

      const again = yield* services(path);
      expect(yield* again.subscriptions.list).toEqual([
        { ...subscription('phone'), keys: { p256dh: 'new', auth: 'new' } },
      ]);
      expect(statSync(join(path, 'push', 'subscriptions.json')).mode & 0o777).toBe(0o600);
    }),
  );

  it.effect('loses no device when several subscribe at once', () =>
    Effect.gen(function* () {
      const { subscriptions } = yield* services(folder());

      yield* Effect.forEach(
        ['a', 'b', 'c', 'd'],
        (name) => subscriptions.save(subscription(name)),
        {
          concurrency: 'unbounded',
        },
      );

      expect((yield* subscriptions.list).map((kept) => kept.endpoint).sort()).toEqual([
        'https://push.example/a',
        'https://push.example/b',
        'https://push.example/c',
        'https://push.example/d',
      ]);
    }),
  );

  it.effect('reports a broken devices file and does not overwrite it', () =>
    Effect.gen(function* () {
      const path = folder();
      const { subscriptions } = yield* services(path);
      yield* subscriptions.save(subscription('phone'));
      const file = join(path, 'push', 'subscriptions.json');
      writeFileSync(file, '{ broken');

      const listed = yield* subscriptions.list.pipe(Effect.flip);
      const saved = yield* subscriptions.save(subscription('laptop')).pipe(Effect.flip);

      expect(listed).toBeInstanceOf(PushStoreError);
      expect(saved).toBeInstanceOf(PushStoreError);
      expect(readFileSync(file, 'utf-8')).toBe('{ broken');
    }),
  );

  it.effect('makes a P-256 key pair once and keeps it across restarts', () =>
    Effect.gen(function* () {
      const path = folder();
      const first = yield* services(path);

      const publicKey = yield* first.keys.publicKey;
      const vapid = yield* first.vapid.keys;
      const again = yield* services(path);

      // An uncompressed P-256 point is 65 bytes, its private key 32.
      expect(Buffer.from(publicKey, 'base64url')).toHaveLength(65);
      expect(Buffer.from(vapid.privateKey, 'base64url')).toHaveLength(32);
      expect(publicKey).toMatch(base64url);
      expect(vapid.publicKey).toBe(publicKey);
      expect(yield* again.keys.publicKey).toBe(publicKey);
      expect(statSync(join(path, 'push', 'vapid.json')).mode & 0o777).toBe(0o600);
      expect(statSync(join(path, 'push')).mode & 0o777).toBe(0o700);
    }),
  );

  it('pads a private key that Node gives without its leading zero bytes to 32 bytes', () => {
    const short = Buffer.alloc(31, 0xab);

    const key = Buffer.from(privateKeyOf(short), 'base64url');

    expect(key).toHaveLength(32);
    expect(key[0]).toBe(0);
    expect(key.subarray(1)).toEqual(short);
  });

  it.effect('reports stored keys of the wrong length', () =>
    Effect.gen(function* () {
      const path = folder();
      yield* (yield* services(path)).keys.publicKey;
      const file = join(path, 'push', 'vapid.json');
      const stored = JSON.parse(readFileSync(file, 'utf-8'));
      writeFileSync(
        file,
        JSON.stringify({ ...stored, privateKey: Buffer.alloc(31, 1).toString('base64url') }),
      );

      const error = yield* (yield* services(path)).keys.publicKey.pipe(Effect.flip);

      expect(error).toBeInstanceOf(PushStoreError);
    }),
  );

  it.effect('makes one key pair when it is asked for it twice at once', () =>
    Effect.gen(function* () {
      const { keys } = yield* services(folder());

      const [a, b] = yield* Effect.all([keys.publicKey, keys.publicKey], {
        concurrency: 'unbounded',
      });

      expect(a).toBe(b);
    }),
  );

  it.effect('reports a broken key file and does not replace the keys', () =>
    Effect.gen(function* () {
      const path = folder();
      yield* (yield* services(path)).keys.publicKey;
      const file = join(path, 'push', 'vapid.json');
      writeFileSync(file, '{}');

      const error = yield* (yield* services(path)).keys.publicKey.pipe(Effect.flip);

      expect(error).toBeInstanceOf(PushStoreError);
      expect(readFileSync(file, 'utf-8')).toBe('{}');
    }),
  );
});
