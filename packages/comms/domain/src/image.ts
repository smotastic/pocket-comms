import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';

// The rules of images in a prompt (spec 014): what the server accepts, how a prompt names them
// and how a prompt that names them is shown again.

export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_RETENTION_DAYS = 30;

/** The formats the server keeps, told apart by their content. */
export type ImageKind = 'jpeg' | 'png';

/** The file extension of each kind. */
export const IMAGE_EXTENSIONS: Record<ImageKind, string> = { jpeg: 'jpg', png: 'png' };

// The server makes ids itself: 26 characters of lowercase base32.
const IMAGE_ID = /^[a-z2-7]{26}$/u;

export const isImageId = (id: string): boolean => IMAGE_ID.test(id);

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, magic: ReadonlyArray<number>) =>
  bytes.length >= magic.length && magic.every((byte, index) => bytes[index] === byte);

/** The kind of an image by its magic number, whatever its name or declared type says. */
export const imageKindOf = (bytes: Uint8Array): ImageKind | undefined => {
  if (startsWith(bytes, PNG)) return 'png';
  if (startsWith(bytes, JPEG)) return 'jpeg';
  return undefined;
};

const invalid = (field: string, message: string) =>
  Result.fail(new InvalidInputError({ issues: [{ field, message }] }));

/** An upload is a JPEG or PNG of at most `MAX_IMAGE_BYTES`. */
export const parseImage = (bytes: Uint8Array): Result.Result<ImageKind, InvalidInputError> => {
  if (bytes.length > MAX_IMAGE_BYTES) {
    return invalid('file', `The image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
  }
  const kind = imageKindOf(bytes);
  if (kind === undefined) return invalid('file', 'Only JPEG and PNG images can be attached.');
  return Result.succeed(kind);
};

/** A prompt names at most `MAX_IMAGES` images, each by an id the server made. */
export const parseImageIds = (
  ids: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<string>, InvalidInputError> => {
  if (ids.length > MAX_IMAGES) return invalid('imageIds', `Attach at most ${MAX_IMAGES} images.`);
  const bad = ids.find((id) => !isImageId(id));
  if (bad !== undefined) return invalid('imageIds', `${bad} is not an attached image.`);
  return Result.succeed(ids);
};

/** The text, a blank line and one path per line; only the paths when there is no text. */
export const promptWithImages = (text: string, paths: ReadonlyArray<string>): string =>
  [text, paths.join('\n')].filter((part) => part !== '').join('\n\n');

/**
 * A prompt as the chat shows it: the lines that are exactly a path to an image in `folder` become
 * the ids of `images`, in order, and the rest is the text, trimmed. Other paths stay text.
 */
export const imagesInPrompt = (
  text: string,
  folder: string,
): { readonly text: string; readonly images: ReadonlyArray<string> } => {
  const images: Array<string> = [];
  const kept: Array<string> = [];
  for (const line of text.split('\n')) {
    const id = imageIdOfPath(line.trim(), folder);
    if (id === undefined) kept.push(line);
    else images.push(id);
  }
  return images.length === 0 ? { text, images } : { text: kept.join('\n').trim(), images };
};

const imageIdOfPath = (path: string, folder: string): string | undefined => {
  const prefix = folder.endsWith('/') ? folder : `${folder}/`;
  if (!path.startsWith(prefix)) return undefined;
  const name = path.slice(prefix.length);
  const dot = name.lastIndexOf('.');
  const id = name.slice(0, dot);
  const extension = name.slice(dot + 1);
  return dot > 0 && isImageId(id) && Object.values(IMAGE_EXTENSIONS).includes(extension)
    ? id
    : undefined;
};
