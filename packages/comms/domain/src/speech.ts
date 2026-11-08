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

// An MP3 frame header: eleven set bits, a version that is not the reserved one, layer III, and a
// bitrate and sample rate that are not the invalid ones. Anything looser takes the UTF-16 mark
// `FF FE` of a text file for audio.
const isMp3Frame = (bytes: Uint8Array) => {
  if (bytes.length < 3 || bytes[0] !== 0xff) return false;
  const flags = bytes[1] ?? 0;
  const rates = bytes[2] ?? 0;
  return (
    (flags & 0xe0) === 0xe0 &&
    (flags & 0x18) !== 0x08 &&
    (flags & 0x06) === 0x02 &&
    (rates & 0xf0) !== 0xf0 &&
    (rates & 0x0c) !== 0x0c
  );
};

// Photos share the MP4 container (`ftyp`); their brands say they are pictures.
const PICTURE_BRANDS = ['heic', 'heix', 'heim', 'heis', 'hevc', 'mif1', 'msf1', 'avif', 'avis'];

const isMp4Audio = (bytes: Uint8Array) =>
  at(bytes, 4, ascii('ftyp')) && !PICTURE_BRANDS.some((brand) => at(bytes, 8, ascii(brand)));

/** The format of a clip by its magic number, whatever its name or declared type says. */
const clipFormatOf = (bytes: Uint8Array): ClipFormat | undefined => {
  if (isMp4Audio(bytes)) return 'mp4';
  if (at(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm';
  if (at(bytes, 0, ascii('OggS'))) return 'ogg';
  if (at(bytes, 0, ascii('RIFF')) && at(bytes, 8, ascii('WAVE'))) return 'wav';
  if (at(bytes, 0, ascii('ID3')) || isMp3Frame(bytes)) return 'mp3';
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
