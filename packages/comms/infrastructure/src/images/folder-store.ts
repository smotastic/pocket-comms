import {
  ImageNotSavedError,
  ImagesOutbound,
  type StoredImage,
} from '@pocket-comms/comms-application';
import { IMAGE_EXTENSIONS, isImageId, type ImageKind } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// The attached images as files in the `images` folder of the server's state folder (spec 014).
// The store names every file itself, `<id>.<ext>`, and only ever opens a name of that shape that
// is a plain file, never a symlink.

const KINDS = Object.entries(IMAGE_EXTENSIONS) as ReadonlyArray<[ImageKind, string]>;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const TEMPORARY = '.tmp';

// 130 random bits as 26 characters of lowercase base32.
const newId = () => {
  const bytes = randomBytes(17);
  let bits = 0;
  let value = 0;
  let id = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && id.length < 26) {
      id += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return id;
};

const isPlainFile = (path: string) =>
  lstat(path).then(
    (info) => info.isFile(),
    () => false,
  );

export interface FolderStoreOptions {
  /** The server's state folder, such as `~/.pocket-comms`; `images` below it is created when missing. */
  readonly stateDir: string;
}

export const layerFolder = ({ stateDir }: FolderStoreOptions) => {
  const folder = join(resolve(stateDir), 'images');

  const find = async (id: string) => {
    if (!isImageId(id)) return undefined;
    for (const [kind, extension] of KINDS) {
      const path = join(folder, `${id}.${extension}`);
      if (await isPlainFile(path)) return { kind, path };
    }
    return undefined;
  };

  // A failed write leaves no temporary file behind; one a crash leaves is swept.
  const save = (image: StoredImage) =>
    Effect.tryPromise({
      try: async () => {
        await mkdir(folder, { recursive: true, mode: 0o700 });
        const id = newId();
        const path = join(folder, `${id}.${IMAGE_EXTENSIONS[image.kind]}`);
        const temporary = join(folder, `.${randomUUID()}${TEMPORARY}`);
        try {
          await writeFile(temporary, image.bytes, { mode: 0o600 });
          await rename(temporary, path);
        } catch (error) {
          await unlink(temporary).catch(() => undefined);
          throw error;
        }
        return id;
      },
      catch: (error) =>
        new ImageNotSavedError({
          reason: error instanceof Error ? error.message : 'The image could not be written.',
        }),
    }).pipe(Effect.withSpan('Images.save'));

  const path = (id: string) =>
    Effect.promise(() => find(id)).pipe(Effect.map((found) => Option.fromNullishOr(found?.path)));

  const read = (id: string) =>
    Effect.promise(async () => {
      const found = await find(id);
      if (found === undefined) return Option.none<StoredImage>();
      const bytes = await readFile(found.path).catch(() => undefined);
      return bytes === undefined
        ? Option.none<StoredImage>()
        : Option.some<StoredImage>({ kind: found.kind, bytes: new Uint8Array(bytes) });
    });

  const removeOlderThan = (epochMillis: number) =>
    Effect.promise(async () => {
      const names = await readdir(folder).catch(() => []);
      let removed = 0;
      for (const name of names) {
        const dot = name.lastIndexOf('.');
        const known = KINDS.some(([, extension]) => name.slice(dot + 1) === extension);
        const image = dot > 0 && known && isImageId(name.slice(0, dot));
        const leftOver = name.startsWith('.') && name.endsWith(TEMPORARY);
        if (!image && !leftOver) continue;
        const info = await lstat(join(folder, name)).catch(() => undefined);
        if (info?.isFile() !== true || info.mtimeMs >= epochMillis) continue;
        await unlink(join(folder, name)).then(
          () => (removed += image ? 1 : 0),
          () => undefined,
        );
      }
      return removed;
    }).pipe(Effect.withSpan('Images.removeOlderThan'));

  return Layer.succeed(
    ImagesOutbound,
    ImagesOutbound.of({ folder, save, path, read, removeOlderThan }),
  );
};
