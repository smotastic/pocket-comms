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

// Pi writes one JSON object per line. Chat lines have `type: "message"` and a `message` with a
// role: `user`, `assistant` (text, thinking and tool calls) or `toolResult`.

/** `~/.pi/agent/sessions/--<cwd without the leading / and with / as ->--`. */
export const piSessionFolder = (home: string, cwd: string): string =>
  join(home, '.pi', 'agent', 'sessions', `--${cwd.replace(/^\//, '').replace(/\//g, '-')}--`);

const summarise = (cwd: string | undefined, name: string, args: unknown): ToolSummary => {
  const field = (key: string) => stringField(args, key);
  const path = (key: string) => {
    const value = field(key);
    return value === undefined ? undefined : relativeTo(cwd, value);
  };
  switch (name) {
    case 'bash':
      return { verb: 'Ran', target: oneLine(field('command') ?? '') };
    case 'edit':
      return { verb: 'Edited', target: path('path') };
    case 'write':
      return { verb: 'Wrote', target: path('path'), added: lineCount(field('content') ?? '') };
    case 'read':
      return { verb: 'Read', target: path('path') };
    case 'grep':
    case 'find':
      return { verb: 'Searched', target: field('pattern') };
    case 'ls':
      return { verb: 'Searched', target: path('path') };
    default:
      return { verb: 'Used', target: name };
  }
};

const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(isRecord)
    .filter((block) => block['type'] === 'text')
    .map((block) => stringField(block, 'text') ?? '')
    .join('\n');
};

// An edit's result carries a numbered diff; its changed lines start with `+` or `-`.
const editCounts = (message: Record<string, unknown>) => {
  const diff = stringField(message['details'], 'diff');
  return diff === undefined ? undefined : diffCounts(diff.split('\n'));
};

export const createPiParser = (cwd: string | undefined): TranscriptParser => {
  const log = entryLog();

  const push = (raw: string): ReadonlyArray<TranscriptEntry> => {
    const line = parseLine(raw);
    const message = line?.['message'];
    if (line?.['type'] !== 'message' || !isRecord(message)) return [];
    const id = stringField(line, 'id') ?? '';
    const at = Date.parse(stringField(line, 'timestamp') ?? '');
    const changed: Array<TranscriptEntry> = [];

    switch (message['role']) {
      case 'user': {
        const text = textOf(message['content']);
        if (text.trim() !== '') changed.push(log.add({ type: 'user', id, at, text }));
        break;
      }
      case 'assistant': {
        const content = message['content'];
        (Array.isArray(content) ? content.filter(isRecord) : []).forEach((block, index) => {
          if (block['type'] === 'text') {
            const text = stringField(block, 'text') ?? '';
            if (text.trim() !== '') {
              changed.push(log.add({ type: 'assistant', id: `${id}:${index}`, at, text }));
            }
          } else if (block['type'] === 'toolCall') {
            const summary = summarise(
              cwd,
              stringField(block, 'name') ?? 'a tool',
              block['arguments'],
            );
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
        break;
      }
      case 'toolResult': {
        const finished = log.finish(
          stringField(message, 'toolCallId') ?? '',
          message['isError'] === true ? 'error' : 'ok',
          editCounts(message),
        );
        if (finished !== undefined) changed.push(finished);
        break;
      }
    }
    return changed;
  };

  return { push, entries: log.entries };
};
