import { describe, expect, it } from '@effect/vitest';
import { ImagesOutbound } from '@pocket-comms/comms-application';
import { isImageId } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFolder } from './folder-store.js';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 7]);

const stateDir = () => mkdtempSync(join(tmpdir(), 'comms-images-'));

const store = (dir: string) => ImagesOutbound.pipe(Effect.provide(layerFolder({ stateDir: dir })));

describe('the image folder store', () => {
  it.effect('saves an image under a new id and reads it back', () =>
    Effect.gen(function* () {
      const dir = stateDir();
      const images = yield* store(dir);

      const id = yield* images.save({ kind: 'png', bytes: PNG });

      expect(isImageId(id)).toBe(true);
      expect(images.folder).toBe(join(dir, 'images'));
      expect(yield* images.path(id)).toEqual(Option.some(join(dir, 'images', `${id}.png`)));
      expect(yield* images.read(id)).toEqual(Option.some({ kind: 'png', bytes: PNG }));
      expect(readdirSync(join(dir, 'images'))).toEqual([`${id}.png`]);
    }),
  );

  it.effect('gives a JPEG the jpg extension and every image its own id', () =>
    Effect.gen(function* () {
      const dir = stateDir();
      const images = yield* store(dir);

      const first = yield* images.save({ kind: 'jpeg', bytes: JPEG });
      const second = yield* images.save({ kind: 'jpeg', bytes: JPEG });

      expect(first).not.toBe(second);
      expect(yield* images.path(first)).toEqual(Option.some(join(dir, 'images', `${first}.jpg`)));
    }),
  );

  it.effect('knows no id of another shape, nor a symlink', () =>
    Effect.gen(function* () {
      const dir = stateDir();
      mkdirSync(join(dir, 'images'));
      writeFileSync(join(dir, 'secret.png'), PNG);
      const linked = 'a'.repeat(26);
      symlinkSync(join(dir, 'secret.png'), join(dir, 'images', `${linked}.png`));
      const images = yield* store(dir);

      expect(yield* images.path('../secret')).toEqual(Option.none());
      expect(yield* images.read(linked)).toEqual(Option.none());
      expect(yield* images.path('b'.repeat(26))).toEqual(Option.none());
    }),
  );

  it.effect('removes only the images saved before the time', () =>
    Effect.gen(function* () {
      const dir = stateDir();
      const images = yield* store(dir);
      const old = yield* images.save({ kind: 'png', bytes: PNG });
      const fresh = yield* images.save({ kind: 'png', bytes: PNG });
      writeFileSync(join(dir, 'images', 'notes.txt'), 'keep');
      const past = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      utimesSync(join(dir, 'images', `${old}.png`), past, past);
      utimesSync(join(dir, 'images', 'notes.txt'), past, past);

      const removed = yield* images.removeOlderThan(Date.now() - 30 * 24 * 60 * 60 * 1000);

      expect(removed).toBe(1);
      expect(readdirSync(join(dir, 'images')).sort()).toEqual([`${fresh}.png`, 'notes.txt'].sort());
    }),
  );

  it.effect('removes nothing before the folder exists', () =>
    Effect.gen(function* () {
      const images = yield* store(stateDir());

      expect(yield* images.removeOlderThan(Date.now())).toBe(0);
    }),
  );
});
