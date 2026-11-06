import { describe, expect, it } from '@effect/vitest';
import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';
import {
  DEFAULT_QUICK_REPLIES,
  MAX_QUICK_REPLIES,
  MAX_QUICK_REPLY_LENGTH,
  parseQuickReplies,
  suggestedReplies,
} from './replies.js';

const APPROVAL = ['Approved', 'No, revise'];

describe('suggestedReplies', () => {
  it.each([
    'Here is the plan.\n\nDo you approve?',
    'Shall I proceed?',
    'The tests pass. Should I go ahead and open the PR?',
    'Want me to commit this?',
    'Would you like me to continue?',
    'Does this look good?',
    'I would rename the module. OK?',
    'Sounds good?\n\n',
  ])('suggests an approval for %j', (text) => {
    expect(suggestedReplies(text)).toEqual(APPROVAL);
  });

  it.each([
    'Should I use SQLite or Postgres?',
    'Do you approve, or should I revise it?',
    'What should the module be called?',
    'Do you approve? I will wait for the tests first.',
    'Done. The PR is open.',
    '',
    'Do you approve?\n\nI will start once the build is green.',
  ])('suggests nothing for %j', (text) => {
    expect(suggestedReplies(text)).toEqual([]);
  });

  it('suggests the items of a closing numbered list', () => {
    expect(suggestedReplies('Which database?\n\n1. SQLite\n2. Postgres')).toEqual([
      'SQLite',
      'Postgres',
    ]);
  });

  it('suggests the items of a list followed by a question', () => {
    expect(suggestedReplies('Options:\n\n1) SQLite\n2) Postgres\n\nWhich one?')).toEqual([
      'SQLite',
      'Postgres',
    ]);
  });

  it('takes lettered and loose lists and drops Markdown emphasis', () => {
    expect(
      suggestedReplies('Pick one:\n\nA. **Keep** the API\n\nB. `Break` it\n\nC. _Defer_\n'),
    ).toEqual(['Keep the API', 'Break it', 'Defer']);
  });

  it('takes lower case letters', () => {
    expect(suggestedReplies('a) Yes\nb) No')).toEqual(['Yes', 'No']);
  });

  it('suggests nothing for a list with a long item', () => {
    expect(suggestedReplies(`1. Short\n2. ${'x'.repeat(61)}`)).toEqual([]);
  });

  it('suggests nothing for a list of one or more than four items', () => {
    expect(suggestedReplies('1. Only')).toEqual([]);
    expect(suggestedReplies('1. A\n2. B\n3. C\n4. D\n5. E')).toEqual([]);
  });

  it('suggests nothing for a list that is not numbered in order', () => {
    expect(suggestedReplies('1. First\n3. Third')).toEqual([]);
  });

  it('suggests nothing for a list in the middle of a message', () => {
    expect(suggestedReplies('I did:\n\n1. Tests\n2. Docs\n\nAll green.')).toEqual([]);
  });

  it('prefers the choices over an approval question', () => {
    expect(suggestedReplies('1. Merge\n2. Wait\n\nShall I proceed?')).toEqual(['Merge', 'Wait']);
  });
});

const invalid = (...messages: ReadonlyArray<string>) =>
  Result.fail(
    new InvalidInputError({ issues: messages.map((message) => ({ field: 'replies', message })) }),
  );

describe('parseQuickReplies', () => {
  it('has the replies of spec 024 by default', () => {
    expect(DEFAULT_QUICK_REPLIES).toEqual(['Go ahead', 'Commit and open a PR']);
  });

  it('trims each reply and keeps the order', () => {
    expect(parseQuickReplies(['  Run the tests first ', 'Go ahead'])).toEqual(
      Result.succeed(['Run the tests first', 'Go ahead']),
    );
  });

  it('accepts an empty list and the limits', () => {
    expect(parseQuickReplies([])).toEqual(Result.succeed([]));
    const most = Array.from({ length: MAX_QUICK_REPLIES }, (_, index) =>
      `${index}`.padEnd(MAX_QUICK_REPLY_LENGTH, 'x'),
    );
    expect(parseQuickReplies(most)).toEqual(Result.succeed(most));
  });

  it('rejects too many replies', () => {
    const many = Array.from({ length: MAX_QUICK_REPLIES + 1 }, (_, index) => `Reply ${index}`);
    expect(parseQuickReplies(many)).toEqual(
      invalid(`Keep at most ${MAX_QUICK_REPLIES} quick replies.`),
    );
  });

  it('names every broken reply', () => {
    expect(
      parseQuickReplies([' ', 'x'.repeat(MAX_QUICK_REPLY_LENGTH + 1), 'one\ntwo', 'Go', 'Go ']),
    ).toEqual(
      invalid(
        'Reply 1 is blank.',
        `Reply 2 is longer than ${MAX_QUICK_REPLY_LENGTH} characters.`,
        'Reply 3 has a line break or a control character.',
        'Reply 5 is the same as reply 4.',
      ),
    );
  });
});
