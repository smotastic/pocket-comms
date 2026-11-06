import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import { InvalidInputError } from './errors.js';

export const MAX_PROMPT_LENGTH = 20_000;
export const MAX_KEYS = 8;
export const MAX_TYPED_LENGTH = 2_000;

/** The keys the app can send: the approval choices, the arrows, Enter, Escape and Ctrl-C. */
export const AgentKey = Schema.Literals(['1', '2', '3', 'up', 'down', 'enter', 'esc', 'ctrl+c']);
export type AgentKey = typeof AgentKey.Type;

const isAgentKey = Schema.is(AgentKey);

const invalid = (field: string, message: string) =>
  Result.fail(new InvalidInputError({ issues: [{ field, message }] }));

/**
 * A prompt is sent trimmed; it must say something and stay within the limit. With `images`
 * attached the text may be blank (spec 014).
 */
export const parsePrompt = (text: string, images = 0): Result.Result<string, InvalidInputError> => {
  const trimmed = text.trim();
  if (trimmed === '' && images === 0) return invalid('text', 'Write a message first.');
  if (trimmed.length > MAX_PROMPT_LENGTH) {
    return invalid('text', `The message is longer than ${MAX_PROMPT_LENGTH} characters.`);
  }
  return Result.succeed(trimmed);
};

/**
 * Text typed into a waiting dialog is kept on one line without control characters: a terminal
 * takes a line break or a carriage return as Enter, and Escape or Ctrl-C as keys. It is trimmed,
 * must say something and stay within the limit.
 */
export const parseTyped = (text: string): Result.Result<string, InvalidInputError> => {
  const line = text
    .replace(/\r\n|[\r\n\t]/gu, ' ')
    // eslint-disable-next-line no-control-regex -- the control characters are what is removed.
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, '')
    .trim();
  if (line === '') return invalid('text', 'Write an answer first.');
  if (line.length > MAX_TYPED_LENGTH) {
    return invalid('text', `The answer is longer than ${MAX_TYPED_LENGTH} characters.`);
  }
  return Result.succeed(line);
};

/** Key presses are sent in order; each must be one of the keys the app offers. */
export const parseKeys = (
  keys: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<AgentKey>, InvalidInputError> => {
  if (keys.length === 0) return invalid('keys', 'Choose a key to send.');
  if (keys.length > MAX_KEYS) return invalid('keys', `Send at most ${MAX_KEYS} keys at once.`);
  const parsed: Array<AgentKey> = [];
  for (const key of keys) {
    if (!isAgentKey(key)) return invalid('keys', `${key} is not a key the app can send.`);
    parsed.push(key);
  }
  return Result.succeed(parsed);
};
