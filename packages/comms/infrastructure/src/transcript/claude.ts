import { promptWithImages, type TranscriptEntry } from '@pocket-comms/comms-domain';
import { join } from 'node:path';
import { backgroundLog } from './claude-background.js';
import {
  diffCounts,
  entryLog,
  isRecord,
  lineCount,
  oneLine,
  parseLine,
  relativeTo,
  stringField,
  type ToolSummary,
  type TranscriptParser,
} from './entries.js';

// Claude Code writes one JSON object per line: `user` and `assistant` messages in the API's shape,
// plus bookkeeping lines (modes, snapshots, titles) that the chat does not show.

/** `~/.claude/projects/<cwd with / and . as ->/<session>.jsonl`. */
export const claudeSessionPath = (home: string, cwd: string, session: string): string =>
  join(home, '.claude', 'projects', cwd.replace(/[/.]/g, '-'), `${session}.jsonl`);

// The questions of an `AskUserQuestion` call, each with its text and short header.
const questionsOf = (input: unknown) => {
  const questions = isRecord(input) ? input['questions'] : undefined;
  if (!Array.isArray(questions)) return [];
  return questions.flatMap((question: unknown) => {
    const text = stringField(question, 'question');
    if (text === undefined) return [];
    const header = stringField(question, 'header');
    return [header === undefined ? { text } : { header, text }];
  });
};

// The result of an `AskUserQuestion` call names each answer by its question's text.
const answersOf =
  (result: unknown) =>
  (question: string): string | undefined =>
    stringField(isRecord(result) ? result['answers'] : undefined, question);

const summarise = (cwd: string | undefined, name: string, input: unknown): ToolSummary => {
  const field = (key: string) => stringField(input, key);
  const path = (key: string) => {
    const value = field(key);
    return value === undefined ? undefined : relativeTo(cwd, value);
  };
  switch (name) {
    case 'Bash':
      return { verb: 'Ran', target: oneLine(field('command') ?? '') };
    case 'Edit':
    case 'MultiEdit':
      return { verb: 'Edited', target: path('file_path') };
    case 'NotebookEdit':
      return { verb: 'Edited', target: path('notebook_path') };
    case 'Write':
      return { verb: 'Wrote', target: path('file_path'), added: lineCount(field('content') ?? '') };
    case 'Read':
      return { verb: 'Read', target: path('file_path') };
    case 'Grep':
    case 'Glob':
      return { verb: 'Searched', target: field('pattern') };
    case 'WebSearch':
      return { verb: 'Searched', target: field('query') };
    case 'WebFetch':
      return { verb: 'Fetched', target: field('url') };
    case 'Agent':
    case 'Task':
      return { verb: 'Delegated', target: field('description') };
    case 'Skill':
      return { verb: 'Used', target: field('skill') };
    case 'AskUserQuestion': {
      // A call whose questions cannot be read stays a plain tool line.
      const questions = questionsOf(input);
      return { verb: 'Used', target: name, ...(questions.length === 0 ? {} : { questions }) };
    }
    default:
      return { verb: 'Used', target: name };
  }
};

// A prompt the owner typed. Claude also stores injected text as user messages: skill bodies and
// hand-backs (`isMeta`), the summary that replaces a compacted conversation (`isCompactSummary`),
// and notifications whose origin is not a human.
const isOwnersPrompt = (line: Record<string, unknown>, text: string) => {
  if (line['isMeta'] === true || line['isCompactSummary'] === true) return false;
  const origin = line['origin'];
  if (isRecord(origin)) return origin['kind'] === 'human';
  return !text.trimStart().startsWith('<');
};

const blocksOf = (message: unknown): ReadonlyArray<Record<string, unknown>> => {
  const content = isRecord(message) ? message['content'] : undefined;
  return Array.isArray(content) ? content.filter(isRecord) : [];
};

// Claude reads each image path of a prompt into an image block and shows it as a marker in the
// text; a meta line after the prompt names each image's file.
const IMAGE_MARKER = /\[Image #\d+\]\s*/gu;
const IMAGE_SOURCE = /^\[Image: source: (.+)\]$/u;

const hasImages = (message: unknown) =>
  blocksOf(message).some((block) => block['type'] === 'image');

// The files a meta line names, when it only names image files.
const imageSourcesOf = (message: unknown): ReadonlyArray<string> | undefined => {
  const paths = blocksOf(message).map((block) =>
    block['type'] === 'text' ? IMAGE_SOURCE.exec(stringField(block, 'text') ?? '')?.[1] : undefined,
  );
  return paths.length > 0 && paths.every((path) => path !== undefined) ? paths : undefined;
};

// An edit's result carries the applied patch; its hunks hold the changed lines.
const patchCounts = (result: unknown) => {
  const patch = isRecord(result) ? result['structuredPatch'] : undefined;
  if (!Array.isArray(patch)) return undefined;
  const lines = patch.flatMap((hunk: unknown) => {
    const hunkLines = isRecord(hunk) ? hunk['lines'] : undefined;
    return Array.isArray(hunkLines)
      ? hunkLines.filter((line): line is string => typeof line === 'string')
      : [];
  });
  return diffCounts(lines);
};

// The text of a message or a tool result, whether a string or a list of blocks.
const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .filter(isRecord)
          .map((block) => (block['type'] === 'text' ? (stringField(block, 'text') ?? '') : ''))
          .join('\n')
      : '';

// Claude records a notice that a task ended up to three times: when it queues the notice, as an
// attachment when the notice arrives during a turn, and as a user line between turns.
const taskNoticeOf = (line: Record<string, unknown>): string | undefined => {
  if (line['type'] === 'queue-operation' && line['operation'] === 'enqueue') {
    const content = stringField(line, 'content');
    return content?.trimStart().startsWith('<task-notification>') === true ? content : undefined;
  }
  const attachment = line['attachment'];
  if (line['type'] === 'attachment' && isRecord(attachment)) {
    return attachment['commandMode'] === 'task-notification'
      ? stringField(attachment, 'prompt')
      : undefined;
  }
  const origin = line['origin'];
  if (line['type'] === 'user' && isRecord(origin) && origin['kind'] === 'task-notification') {
    return textOf(isRecord(line['message']) ? line['message']['content'] : undefined);
  }
  return undefined;
};

export interface ClaudeParserOptions {
  /** Read a subagent's own file, whose lines are all sidechain lines. */
  readonly sidechain?: boolean;
}

export const createClaudeParser = (
  cwd: string | undefined,
  { sidechain = false }: ClaudeParserOptions = {},
): TranscriptParser => {
  const log = entryLog();
  const background = backgroundLog();
  // The latest prompt with images, its text without markers and the files named so far.
  let attached: { id: string; text: string; paths: Array<string> } | undefined;

  const push = (raw: string): ReadonlyArray<TranscriptEntry> => {
    const line = parseLine(raw);
    // Lines of a subagent's own conversation belong to that subagent, not to this chat.
    if (line === undefined || (line['isSidechain'] === true) !== sidechain) return [];
    const id = stringField(line, 'uuid') ?? '';
    const at = Date.parse(stringField(line, 'timestamp') ?? '');
    const message = line['message'];
    const changed: Array<TranscriptEntry> = [];

    const notice = taskNoticeOf(line);
    if (notice !== undefined) {
      background.notification(notice);
      return [];
    }

    if (line['type'] === 'user') {
      // The paths go back below the text, as the prompt was sent, so the chat shows the images.
      const sources = line['isMeta'] === true ? imageSourcesOf(message) : undefined;
      if (sources !== undefined) {
        const last = log.last();
        if (attached === undefined || last?.type !== 'user' || last.id !== attached.id) return [];
        attached.paths.push(...sources);
        return [
          log.replaceLast({ ...last, text: promptWithImages(attached.text, attached.paths) }),
        ];
      }
      const content = isRecord(message) ? message['content'] : undefined;
      if (typeof content === 'string') {
        if (isOwnersPrompt(line, content))
          changed.push(log.add({ type: 'user', id, at, text: content }));
        return changed;
      }
      const text = blocksOf(message)
        .filter((block) => block['type'] === 'text')
        .map((block) => stringField(block, 'text') ?? '')
        .join('\n');
      if (text !== '' && isOwnersPrompt(line, text)) {
        changed.push(log.add({ type: 'user', id, at, text }));
        attached = hasImages(message)
          ? { id, text: text.replace(IMAGE_MARKER, '').trim(), paths: [] }
          : undefined;
      }
      for (const block of blocksOf(message)) {
        if (block['type'] !== 'tool_result') continue;
        const toolUseId = stringField(block, 'tool_use_id') ?? '';
        const ok = block['is_error'] !== true;
        const details = line['toolUseResult'];
        background.result(toolUseId, ok, textOf(block['content']), details, at);
        const subagent = stringField(details, 'agentId');
        const finished = log.finish(
          toolUseId,
          ok ? 'ok' : 'error',
          { ...patchCounts(details), ...(subagent === undefined ? {} : { subagent }) },
          answersOf(details),
        );
        if (finished !== undefined) changed.push(finished);
      }
      return changed;
    }

    if (line['type'] === 'assistant') {
      blocksOf(message).forEach((block, index) => {
        if (block['type'] === 'text') {
          const text = stringField(block, 'text') ?? '';
          if (text.trim() !== '') {
            changed.push(log.add({ type: 'assistant', id: `${id}:${index}`, at, text }));
          }
        } else if (block['type'] === 'tool_use') {
          const name = stringField(block, 'name') ?? 'a tool';
          const toolUseId = stringField(block, 'id') ?? `${id}:${index}`;
          background.call(toolUseId, name, block['input'], at);
          const summary = summarise(cwd, name, block['input']);
          changed.push(
            log.add({
              type: 'tool',
              id: toolUseId,
              at,
              ...summary,
              outcome: 'pending',
            }),
          );
        }
      });
    }
    return changed;
  };

  return { push, entries: log.entries, background: background.items };
};
