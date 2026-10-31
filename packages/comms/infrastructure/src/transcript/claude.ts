import type { TranscriptEntry } from '@pocket-comms/comms-domain';
import { join } from 'node:path';
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
    default:
      return { verb: 'Used', target: name };
  }
};

// A prompt the owner typed. Claude also stores injected text as user messages: skill bodies and
// hand-backs (`isMeta`), and notifications whose origin is not a human.
const isOwnersPrompt = (line: Record<string, unknown>, text: string) => {
  if (line['isMeta'] === true) return false;
  const origin = line['origin'];
  if (isRecord(origin)) return origin['kind'] === 'human';
  return !text.trimStart().startsWith('<');
};

const blocksOf = (message: unknown): ReadonlyArray<Record<string, unknown>> => {
  const content = isRecord(message) ? message['content'] : undefined;
  return Array.isArray(content) ? content.filter(isRecord) : [];
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

export const createClaudeParser = (cwd: string | undefined): TranscriptParser => {
  const log = entryLog();

  const push = (raw: string): ReadonlyArray<TranscriptEntry> => {
    const line = parseLine(raw);
    // Lines of a subagent's own conversation belong to that subagent, not to this chat.
    if (line === undefined || line['isSidechain'] === true) return [];
    const id = stringField(line, 'uuid') ?? '';
    const at = Date.parse(stringField(line, 'timestamp') ?? '');
    const message = line['message'];
    const changed: Array<TranscriptEntry> = [];

    if (line['type'] === 'user') {
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
      }
      for (const block of blocksOf(message)) {
        if (block['type'] !== 'tool_result') continue;
        const finished = log.finish(
          stringField(block, 'tool_use_id') ?? '',
          block['is_error'] === true ? 'error' : 'ok',
          patchCounts(line['toolUseResult']),
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
          const summary = summarise(cwd, stringField(block, 'name') ?? 'a tool', block['input']);
          changed.push(
            log.add({
              type: 'tool',
              id: stringField(block, 'id') ?? `${id}:${index}`,
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

  return { push, entries: log.entries };
};
