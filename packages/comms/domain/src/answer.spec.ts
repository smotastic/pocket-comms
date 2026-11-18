import { describe, expect, it } from '@effect/vitest';
import * as Result from 'effect/Result';
import { answerExcerpt, answerKeys, showsQuestion } from './answer.js';
import { InvalidInputError } from './errors.js';
import type { Question } from './transcript.js';

const single = (text: string, ...labels: ReadonlyArray<string>): Question => ({
  text,
  options: labels.map((label) => ({ label })),
  multiple: false,
});
const multiple = (text: string, ...labels: ReadonlyArray<string>): Question => ({
  ...single(text, ...labels),
  multiple: true,
});

const color = single('Pick a color?', 'Red', 'Green', 'Blue', 'Yellow');
const size = single('Pick a size?', 'Small', 'Large');
const pets = multiple('Which pets?', 'Cat', 'Dog', 'Fish');

const invalid = (message: string) =>
  Result.fail(new InvalidInputError({ issues: [{ field: 'answers', message }] }));

describe('answerKeys', () => {
  // Each sequence answered the call as intended in Claude Code v2.1.323 (plan 030, section 4).
  it('chooses the only single choice with its digit, which submits', () => {
    expect(answerKeys([single('Pick a color?', 'Red', 'Green', 'Blue')], [[1]])).toEqual(
      Result.succeed(['2']),
    );
  });

  it('toggles a lone multiple choice, moves on to the review and submits', () => {
    expect(answerKeys([pets], [[0, 2]])).toEqual(Result.succeed(['1', '3', 'right', '1']));
  });

  it('answers two single choices, then submits the review', () => {
    expect(answerKeys([color, size], [[3], [1]])).toEqual(Result.succeed(['4', '2', '1']));
  });

  it('answers a single and a multiple choice, then submits the review', () => {
    expect(answerKeys([color, pets], [[2], [0, 2]])).toEqual(
      Result.succeed(['3', '1', '3', 'right', '1']),
    );
  });

  it('refuses answers for a different number of questions', () => {
    expect(answerKeys([color, size], [[0]])).toEqual(invalid('Answer each of the 2 questions.'));
  });

  it('refuses a question without a chosen option', () => {
    expect(answerKeys([color, pets], [[0], []])).toEqual(
      invalid('Choose an option for "Which pets?".'),
    );
  });

  it('refuses two options for a single choice', () => {
    expect(answerKeys([color], [[0, 1]])).toEqual(
      invalid('Choose only one option for "Pick a color?".'),
    );
  });

  it.each([[[3]], [[-1]], [[0.5]]])('refuses the option %j that the question lacks', (chosen) => {
    expect(answerKeys([pets], [chosen])).toEqual(invalid('"Which pets?" has no such option.'));
  });

  it('refuses the same option twice', () => {
    expect(answerKeys([pets], [[1, 1]])).toEqual(
      invalid('Choose each option of "Which pets?" once.'),
    );
  });

  it('refuses a question whose options are unknown', () => {
    expect(answerKeys([{ text: 'Keep Nx?' }], [[0]])).toEqual(
      invalid('"Keep Nx?" offers no options to choose.'),
    );
  });

  it('refuses an option that has no digit in the dialog', () => {
    const many = single('Pick one?', 'A', 'B', 'C', 'D', 'E');
    expect(answerKeys([many], [[4]])).toEqual(
      invalid('"Pick one?" has more options than the app can choose.'),
    );
  });
});

describe('showsQuestion', () => {
  const dialog = (...lines: ReadonlyArray<string>) =>
    ['⏺ I have a question.', ...lines, 'Enter to select · Esc to cancel'].join('\n');

  it('finds the first question in a fresh dialog, wrapped across lines', () => {
    const question = single('Can you undo an accepted item, even after the page changed?', 'Yes');
    const screen = dialog(
      '←  ☐ Undo  ☐ Language  ✔ Submit  →',
      'Can you undo an accepted item, even',
      'after the page changed?',
      '❯ 1. Yes',
    );

    expect(showsQuestion(screen, [question])).toBe(true);
  });

  it('reads through the colours of the screen', () => {
    const screen = dialog(
      '\u001b[2m←\u001b[0m  \u001b[7m☐ Color\u001b[0m  ✔ Submit  →',
      '\u001b[1mPick a \u001b[36mcolor?\u001b[39m\u001b[0m',
      '\u001b]8;;https://x\u0007❯ 1. Red\u001b]8;;\u0007',
    );

    expect(showsQuestion(screen, [color, pets])).toBe(true);
  });

  it('refuses a dialog with an answered tab', () => {
    const screen = dialog('←  ☒ Color  ☐ Pets  ✔ Submit  →', 'Pick a color?', '❯ 1. Red');

    expect(showsQuestion(screen, [color, pets])).toBe(false);
  });

  it('refuses the review of the answers', () => {
    const screen = dialog('Review your answers', ' ● Pick a color?', '   → Blue');

    expect(showsQuestion(screen, [color])).toBe(false);
  });

  it('refuses a screen with another question', () => {
    const screen = dialog(' ☐ Size', 'Pick a size?', '❯ 1. Small');

    expect(showsQuestion(screen, [color, size])).toBe(false);
  });
});

describe('answerExcerpt', () => {
  it('joins the labels of each question, and the questions', () => {
    expect(answerExcerpt([color, pets], [[2], [0, 2]])).toBe('Blue; Cat, Fish');
  });

  it('cuts a long answer to 80 characters', () => {
    const long = single('Why?', 'x'.repeat(100));

    expect(answerExcerpt([long], [[0]])).toBe(`${'x'.repeat(79)}…`);
  });
});
