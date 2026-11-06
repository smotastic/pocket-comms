import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';

/** The owner's quick replies until they save their own. */
export const DEFAULT_QUICK_REPLIES: ReadonlyArray<string> = ['Go ahead', 'Commit and open a PR'];
export const MAX_QUICK_REPLIES = 20;
export const MAX_QUICK_REPLY_LENGTH = 200;

const MAX_CHOICES = 4;
const MAX_CHOICE_LENGTH = 60;
const APPROVAL: ReadonlyArray<string> = ['Approved', 'No, revise'];

// A yes or no question that asks for approval or leave to go on, such as "Shall I proceed?". A
// question word asks for something else, such as "How should I proceed?".
const ASKS_APPROVAL =
  /\b(?:approve|proceed|go ahead|shall i|should i|want me to|like me to|sounds? good|looks? good|good to go|continue)\b/u;
const ASKS_OK = /(?:^|,\s*)(?:ok|okay)\?$/u;
const QUESTION_WORD = /^(?:what|where|which|how|why|who|whom|whose|when)\b/u;
const LIST_ITEM = /^\s*(\d+|[a-z])[.)]\s+(.+)$/iu;

const isBlank = (line: string) => line.trim() === '';

/** The position of a list marker: 1 for `1` and for `a` or `A`. */
const positionOf = (marker: string) =>
  /^\d+$/u.test(marker) ? Number(marker) : marker.toLowerCase().charCodeAt(0) - 96;

/** The text without its Markdown emphasis; a code span keeps what it holds, as it is. */
const plain = (text: string) =>
  text
    .split(/(`[^`]*`)/u)
    .map((part) =>
      part.startsWith('`') && part.endsWith('`') && part.length > 1
        ? part.slice(1, -1)
        : part
            .replace(/(\*\*|__)(.+?)\1/gu, '$2')
            .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/gu, '$1$2')
            .replace(/(^|[^\w_])_(?!\s)(.+?)_(?!\w)/gu, '$1$2'),
    )
    .join('')
    .trim();

const sentencesOf = (text: string) => text.trim().split(/(?<=[.!?])\s+/u);

const isApprovalQuestion = (sentence: string): boolean => {
  const lower = sentence.trim().toLowerCase();
  if (!lower.endsWith('?') || lower.includes(' or ') || QUESTION_WORD.test(lower)) return false;
  return ASKS_APPROVAL.test(lower) || ASKS_OK.test(lower);
};

/**
 * The items of the list that ends `lines`, blank lines between items allowed, when it is numbered
 * or lettered in order from the first; otherwise none.
 */
const closingList = (lines: ReadonlyArray<string>): ReadonlyArray<string> => {
  const items: Array<{ readonly position: number; readonly text: string }> = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? '';
    if (isBlank(line)) continue;
    const match = LIST_ITEM.exec(line);
    if (match === null) break;
    items.unshift({ position: positionOf(match[1] ?? ''), text: plain(match[2] ?? '') });
  }
  return items.every((item, index) => item.position === index + 1)
    ? items.map((item) => item.text)
    : [];
};

const choicesOf = (lines: ReadonlyArray<string>): ReadonlyArray<string> => {
  // The list ends the message, or one question that asks to choose follows it, such as "Which
  // one?"; an approval question asks about the list as a whole.
  const lastParagraph = lines.map(isBlank).lastIndexOf(true);
  const paragraph = lines.slice(lastParagraph + 1);
  let end = lines.length;
  if (!paragraph.some((line) => LIST_ITEM.test(line))) {
    const sentences = sentencesOf(paragraph.join(' '));
    const question = sentences.length === 1 ? (sentences[0] ?? '') : '';
    if (!question.endsWith('?') || isApprovalQuestion(question)) return [];
    end = lastParagraph;
  }
  const items = [...new Set(closingList(lines.slice(0, Math.max(end, 0))))];
  const fits =
    items.length >= 2 &&
    items.length <= MAX_CHOICES &&
    items.every((item) => item !== '' && item.length <= MAX_CHOICE_LENGTH);
  return fits ? items : [];
};

const asksApproval = (lines: ReadonlyArray<string>): boolean =>
  isApprovalQuestion(sentencesOf(lines.at(-1) ?? '').at(-1) ?? '');

/**
 * The replies an agent's message clearly calls for: the choices of a closing list, else Approved
 * and No, revise for a closing approval question, else none, as the expected answer is unclear.
 */
export const suggestedReplies = (text: string): ReadonlyArray<string> => {
  const lines = text.replace(/\r\n?/gu, '\n').trimEnd().split('\n');
  const choices = choicesOf(lines);
  if (choices.length > 0) return choices;
  return asksApproval(lines) ? APPROVAL : [];
};

/**
 * The owner's quick replies are saved trimmed, each on one line, not blank, within the limit and
 * different from the ones before it; the list keeps its order and stays within its limit.
 */
export const parseQuickReplies = (
  replies: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<string>, InvalidInputError> => {
  if (replies.length > MAX_QUICK_REPLIES) {
    return Result.fail(
      new InvalidInputError({
        issues: [{ field: 'replies', message: `Keep at most ${MAX_QUICK_REPLIES} quick replies.` }],
      }),
    );
  }
  const trimmed = replies.map((reply) => reply.trim());
  const messages = trimmed.flatMap((reply, index) => {
    const name = `Reply ${index + 1}`;
    if (reply === '') return [`${name} is blank.`];
    if (reply.length > MAX_QUICK_REPLY_LENGTH) {
      return [`${name} is longer than ${MAX_QUICK_REPLY_LENGTH} characters.`];
    }
    // eslint-disable-next-line no-control-regex -- the control characters are what is refused.
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(reply)) {
      return [`${name} has a line break or a control character.`];
    }
    const first = trimmed.indexOf(reply);
    return first < index ? [`${name} is the same as reply ${first + 1}.`] : [];
  });
  return messages.length === 0
    ? Result.succeed(trimmed)
    : Result.fail(
        new InvalidInputError({
          issues: messages.map((message) => ({ field: 'replies', message })),
        }),
      );
};
