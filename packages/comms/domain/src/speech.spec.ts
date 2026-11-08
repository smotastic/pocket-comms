import { describe, expect, it } from '@effect/vitest';
import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';
import { CLIP_EXTENSIONS, MAX_CLIP_BYTES, parseClip } from './speech.js';

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const clip = (...bytes: ReadonlyArray<number>) => Uint8Array.from([...bytes, 0, 0, 0, 0]);

const MP4 = clip(0, 0, 0, 0x20, ...ascii('ftypM4A '));
const WEBM = clip(0x1a, 0x45, 0xdf, 0xa3);
const OGG = clip(...ascii('OggS'));
const WAV = clip(...ascii('RIFF'), 0x24, 0, 0, 0, ...ascii('WAVE'));
const MP3_TAGGED = clip(...ascii('ID3'), 4, 0);
const MP3_FRAME = clip(0xff, 0xfb, 0x90, 0x64);

const fails = (message: string) =>
  Result.fail(new InvalidInputError({ issues: [{ field: 'file', message }] }));

describe('parseClip', () => {
  it.each([
    ['mp4', MP4],
    ['webm', WEBM],
    ['ogg', OGG],
    ['wav', WAV],
    ['mp3', MP3_TAGGED],
    ['mp3', MP3_FRAME],
  ] as const)('tells %s by its content', (format, bytes) => {
    expect(parseClip(bytes)).toEqual(Result.succeed(format));
  });

  it('names a file extension for every format', () => {
    expect(CLIP_EXTENSIONS).toEqual({
      mp4: 'm4a',
      webm: 'webm',
      ogg: 'ogg',
      wav: 'wav',
      mp3: 'mp3',
    });
  });

  it('refuses an empty clip', () => {
    expect(parseClip(new Uint8Array())).toEqual(fails('The voice message is empty.'));
  });

  it('refuses a clip larger than the limit', () => {
    const big = new Uint8Array(MAX_CLIP_BYTES + 1);
    big.set(WEBM);
    expect(parseClip(big)).toEqual(fails('The voice message is larger than 5 MB.'));
  });

  it('accepts a clip of exactly the limit', () => {
    const edge = new Uint8Array(MAX_CLIP_BYTES);
    edge.set(WEBM);
    expect(parseClip(edge)).toEqual(Result.succeed('webm'));
  });

  it.each([
    ['a PNG', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['plain text', new TextEncoder().encode('just some text here')],
    ['a RIFF that is not WAVE', clip(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('AVI '))],
    ['a cut header', Uint8Array.from([0x1a, 0x45])],
  ])('refuses %s', (_, bytes) => {
    expect(parseClip(bytes)).toEqual(fails('Only audio can be transcribed.'));
  });
});
