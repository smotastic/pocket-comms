import { describe, expect, it } from '@effect/vitest';
import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';
import {
  MAX_KEYS,
  MAX_PROMPT_LENGTH,
  MAX_TYPED_LENGTH,
  parseKeys,
  parsePrompt,
  parseTyped,
} from './input.js';

describe('parsePrompt', () => {
  it('trims the text', () => {
    expect(parsePrompt('  hello\n')).toEqual(Result.succeed('hello'));
  });

  it('keeps inner new lines', () => {
    expect(parsePrompt('one\ntwo')).toEqual(Result.succeed('one\ntwo'));
  });

  it.each(['', '   \n '])('rejects the blank text %j', (text) => {
    expect(parsePrompt(text)).toEqual(
      Result.fail(
        new InvalidInputError({ issues: [{ field: 'text', message: 'Write a message first.' }] }),
      ),
    );
  });

  it('accepts blank text with an image', () => {
    expect(parsePrompt('  ', 1)).toEqual(Result.succeed(''));
  });

  it('rejects a text longer than the limit', () => {
    expect(parsePrompt('x'.repeat(MAX_PROMPT_LENGTH + 1))).toEqual(
      Result.fail(
        new InvalidInputError({
          issues: [
            {
              field: 'text',
              message: `The message is longer than ${MAX_PROMPT_LENGTH} characters.`,
            },
          ],
        }),
      ),
    );
  });
});

describe('parseTyped', () => {
  it('trims the text', () => {
    expect(parseTyped('  Use SQLite\n')).toEqual(Result.succeed('Use SQLite'));
  });

  it('turns each line break into one space', () => {
    expect(parseTyped('line one\nline two\r\nthree')).toEqual(
      Result.succeed('line one line two three'),
    );
  });

  it('turns a lone carriage return into a space, since a terminal takes it as Enter', () => {
    expect(parseTyped('2\rok')).toEqual(Result.succeed('2 ok'));
  });

  it('drops control characters such as Escape and Ctrl-C', () => {
    expect(parseTyped('a\u001b[Ab\u0003c\u007f\td')).toEqual(Result.succeed('a[Abc d'));
  });

  it.each(['', '  \n ', '\u001b'])('rejects the blank text %j', (text) => {
    expect(parseTyped(text)).toEqual(
      Result.fail(
        new InvalidInputError({ issues: [{ field: 'text', message: 'Write an answer first.' }] }),
      ),
    );
  });

  it('accepts a text at the limit', () => {
    expect(parseTyped('x'.repeat(MAX_TYPED_LENGTH))).toEqual(
      Result.succeed('x'.repeat(MAX_TYPED_LENGTH)),
    );
  });

  it('rejects a text longer than the limit', () => {
    expect(parseTyped('x'.repeat(MAX_TYPED_LENGTH + 1))).toEqual(
      Result.fail(
        new InvalidInputError({
          issues: [
            { field: 'text', message: `The answer is longer than ${MAX_TYPED_LENGTH} characters.` },
          ],
        }),
      ),
    );
  });
});

describe('parseKeys', () => {
  it('accepts the keys of the approval panel', () => {
    expect(parseKeys(['1', '2', '3', 'up', 'down', 'enter', 'esc', 'ctrl+c'])).toEqual(
      Result.succeed(['1', '2', '3', 'up', 'down', 'enter', 'esc', 'ctrl+c']),
    );
  });

  it('rejects a key outside the list', () => {
    expect(parseKeys(['enter', 'ctrl+d'])).toEqual(
      Result.fail(
        new InvalidInputError({
          issues: [{ field: 'keys', message: 'ctrl+d is not a key the app can send.' }],
        }),
      ),
    );
  });

  it('rejects an empty list', () => {
    expect(Result.isFailure(parseKeys([]))).toBe(true);
  });

  it('rejects more keys than the limit', () => {
    expect(Result.isFailure(parseKeys(Array.from({ length: MAX_KEYS + 1 }, () => 'up')))).toBe(
      true,
    );
  });
});
