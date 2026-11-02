import { describe, expect, it } from '@effect/vitest';
import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';
import {
  imageKindOf,
  imagesInPrompt,
  isImageId,
  MAX_IMAGE_BYTES,
  parseImage,
  parseImageIds,
  promptWithImages,
} from './image.js';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const ID = 'abcdefghijklmnopqrstuvwxyz';
const OTHER = 'zyxwvutsrqponmlkjihgfedcba';
const FOLDER = '/home/me/.pocket-comms/images';

const fails = (field: string, message: string) =>
  Result.fail(new InvalidInputError({ issues: [{ field, message }] }));

describe('imageKindOf', () => {
  it('tells a PNG and a JPEG by their content', () => {
    expect(imageKindOf(PNG)).toBe('png');
    expect(imageKindOf(JPEG)).toBe('jpeg');
  });

  it.each([new TextEncoder().encode('not an image'), new Uint8Array(), JPEG.slice(0, 2)])(
    'knows no other content',
    (bytes) => {
      expect(imageKindOf(bytes)).toBeUndefined();
    },
  );
});

describe('parseImage', () => {
  it('accepts a JPEG or a PNG', () => {
    expect(parseImage(PNG)).toEqual(Result.succeed('png'));
    expect(parseImage(JPEG)).toEqual(Result.succeed('jpeg'));
  });

  it('refuses other content', () => {
    expect(parseImage(new TextEncoder().encode('x.png'))).toEqual(
      fails('file', 'Only JPEG and PNG images can be attached.'),
    );
  });

  it('refuses an image larger than the limit', () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    expect(parseImage(big)).toEqual(fails('file', 'The image is larger than 10 MB.'));
  });
});

describe('parseImageIds', () => {
  it('accepts up to five ids the server makes', () => {
    expect(parseImageIds([ID, OTHER])).toEqual(Result.succeed([ID, OTHER]));
    expect(isImageId(ID)).toBe(true);
  });

  it('refuses more than five', () => {
    expect(parseImageIds(Array.from({ length: 6 }, () => ID))).toEqual(
      fails('imageIds', 'Attach at most 5 images.'),
    );
  });

  it.each(['../secret', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'short'])('refuses the id %j', (id) => {
    expect(parseImageIds([id])).toEqual(fails('imageIds', `${id} is not an attached image.`));
  });
});

describe('promptWithImages', () => {
  it('puts the paths after the text and a blank line', () => {
    expect(promptWithImages('Why?', ['/a.jpg', '/b.png'])).toBe('Why?\n\n/a.jpg\n/b.png');
  });

  it('is only the paths without text', () => {
    expect(promptWithImages('', ['/a.jpg'])).toBe('/a.jpg');
  });

  it('is the text without images', () => {
    expect(promptWithImages('Why?', [])).toBe('Why?');
  });
});

describe('imagesInPrompt', () => {
  it('takes the image paths out of the text', () => {
    expect(imagesInPrompt(`Why?\n\n${FOLDER}/${ID}.jpg\n${FOLDER}/${OTHER}.png`, FOLDER)).toEqual({
      text: 'Why?',
      images: [ID, OTHER],
    });
  });

  it('keeps a prompt without image paths as it is', () => {
    expect(imagesInPrompt('  Look at /tmp/x.png\n', FOLDER)).toEqual({
      text: '  Look at /tmp/x.png\n',
      images: [],
    });
  });

  it.each([
    `${FOLDER}/${ID}.gif`,
    `${FOLDER}/../${ID}.jpg`,
    `${FOLDER}/sub/${ID}.jpg`,
    `/other/${ID}.jpg`,
    `see ${FOLDER}/${ID}.jpg`,
  ])('keeps the line %j as text', (line) => {
    expect(imagesInPrompt(line, FOLDER).images).toEqual([]);
  });
});
