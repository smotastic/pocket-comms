import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';

// The rules of a voice message: what the server passes on to the speech-to-text service.

/** Two minutes of what phones record is about 1 MB; the rest is room for plainer formats. */
export const MAX_CLIP_BYTES = 5 * 1024 * 1024;

/** The audio formats the server passes on, told apart by their content. */
export type ClipFormat = 'mp4' | 'webm' | 'ogg' | 'wav' | 'mp3';

/** The file extension of each format; the speech-to-text service decodes by it. */
export const CLIP_EXTENSIONS: Record<ClipFormat, string> = {
  mp4: 'm4a',
  webm: 'webm',
  ogg: 'ogg',
  wav: 'wav',
  mp3: 'mp3',
};

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

const at = (bytes: Uint8Array, offset: number, magic: ReadonlyArray<number>) =>
  bytes.length >= offset + magic.length &&
  magic.every((byte, index) => bytes[offset + index] === byte);

// An MPEG audio frame starts with eleven set bits.
const isMpegFrame = (bytes: Uint8Array) =>
  bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0;

/** The format of a clip by its magic number, whatever its name or declared type says. */
const clipFormatOf = (bytes: Uint8Array): ClipFormat | undefined => {
  if (at(bytes, 4, ascii('ftyp'))) return 'mp4';
  if (at(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm';
  if (at(bytes, 0, ascii('OggS'))) return 'ogg';
  if (at(bytes, 0, ascii('RIFF')) && at(bytes, 8, ascii('WAVE'))) return 'wav';
  if (at(bytes, 0, ascii('ID3')) || isMpegFrame(bytes)) return 'mp3';
  return undefined;
};

const invalid = (message: string) =>
  Result.fail(new InvalidInputError({ issues: [{ field: 'file', message }] }));

/** A voice message is audio of at most `MAX_CLIP_BYTES`, and not empty. */
export const parseClip = (bytes: Uint8Array): Result.Result<ClipFormat, InvalidInputError> => {
  if (bytes.length === 0) return invalid('The voice message is empty.');
  if (bytes.length > MAX_CLIP_BYTES) {
    return invalid(`The voice message is larger than ${MAX_CLIP_BYTES / 1024 / 1024} MB.`);
  }
  const format = clipFormatOf(bytes);
  if (format === undefined) return invalid('Only audio can be transcribed.');
  return Result.succeed(format);
};
