import * as Result from 'effect/Result';
import { promptExcerpt } from './activity.js';
import { InvalidInputError } from './errors.js';
import type { DialogKey } from './input.js';
import type { Question } from './transcript.js';

// Claude's question dialog, as of Claude Code v2.1.323: each question is a tab and the dialog
// opens on the first. A single choice's digit chooses its option and moves on; a multiple
// choice's digit toggles its option and `right` moves on. One single-choice question is
// submitted by its digit; any other call ends on a review whose option 1 submits it.

/** The digits of a question's options, in order; Claude offers at most four. */
const DIGITS: ReadonlyArray<DialogKey> = ['1', '2', '3', '4'];

const invalid = (message: string) =>
  Result.fail(new InvalidInputError({ issues: [{ field: 'answers', message }] }));

const checkChosen = (
  question: Question,
  chosen: ReadonlyArray<number>,
): Result.Result<void, InvalidInputError> => {
  const options = question.options ?? [];
  if (options.length === 0) return invalid(`"${question.text}" offers no options to choose.`);
  if (chosen.length === 0) return invalid(`Choose an option for "${question.text}".`);
  if (question.multiple !== true && chosen.length > 1) {
    return invalid(`Choose only one option for "${question.text}".`);
  }
  if (!chosen.every((index) => Number.isInteger(index) && index >= 0 && index < options.length)) {
    return invalid(`"${question.text}" has no such option.`);
  }
  if (new Set(chosen).size !== chosen.length) {
    return invalid(`Choose each option of "${question.text}" once.`);
  }
  if (chosen.some((index) => index >= DIGITS.length)) {
    return invalid(`"${question.text}" has more options than the app can choose.`);
  }
  return Result.succeed(undefined);
};

/**
 * The keys that answer a fresh dialog with the chosen options' indexes, one list per question,
 * and submit it.
 */
export const answerKeys = (
  questions: ReadonlyArray<Question>,
  answers: ReadonlyArray<ReadonlyArray<number>>,
): Result.Result<ReadonlyArray<DialogKey>, InvalidInputError> => {
  if (answers.length !== questions.length) {
    return invalid(`Answer each of the ${questions.length} questions.`);
  }
  const keys: Array<DialogKey> = [];
  for (const [index, question] of questions.entries()) {
    const chosen = answers[index] ?? [];
    const checked = checkChosen(question, chosen);
    if (Result.isFailure(checked)) return Result.fail(checked.failure);
    keys.push(...chosen.flatMap((option) => DIGITS[option] ?? []));
    if (question.multiple === true) keys.push('right');
  }
  const submitsAtOnce = questions.length === 1 && questions[0]?.multiple !== true;
  if (!submitsAtOnce) keys.push('1');
  return Result.succeed(keys);
};

const TAB_ROW = /^\s*(?:←\s+)?[☐☒]/u;
// Claude draws a bar before a question's lines and boxes around previews; neither is its text.
const withoutSpace = (text: string) => text.replace(/[\s\u2500-\u257f]+/gu, '');
// Herdr reads the screen with its escape sequences: colours (CSI) and links (OSC).
const ESCAPES =
  // eslint-disable-next-line no-control-regex -- the escape sequences are what is removed.
  /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-_]/gu;

/**
 * Whether the screen ends in the dialog of these questions, still fresh: no tab answered, not the
 * review, and the first question shown. The dialog wraps its text, so spaces and box drawing do
 * not count.
 */
export const showsQuestion = (screen: string, questions: ReadonlyArray<Question>): boolean => {
  const first = questions[0];
  if (first === undefined) return false;
  const lines = screen.replace(ESCAPES, '').split('\n');
  const tabRow = lines.length - 1 - [...lines].reverse().findIndex((line) => TAB_ROW.test(line));
  if (tabRow === lines.length) return false;
  const dialog = lines.slice(tabRow).join('\n');
  return (
    !(lines[tabRow] ?? '').includes('☒') &&
    !dialog.includes('Review your answers') &&
    withoutSpace(dialog).includes(withoutSpace(first.text))
  );
};

/** The chosen labels for the timeline: each question's joined with ", ", the questions with "; ". */
export const answerExcerpt = (
  questions: ReadonlyArray<Question>,
  answers: ReadonlyArray<ReadonlyArray<number>>,
): string =>
  promptExcerpt(
    questions
      .map((question, index) =>
        (answers[index] ?? []).map((option) => question.options?.[option]?.label ?? '').join(', '),
      )
      .join('; '),
  );
