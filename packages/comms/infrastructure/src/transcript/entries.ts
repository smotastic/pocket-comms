import type { ToolOutcome, ToolVerb, TranscriptEntry } from '@pocket-comms/comms-domain';

/** Reads one session file line by line and keeps the chat entries it found so far. */
export interface TranscriptParser {
  /** Reads one line and returns the entries it added or changed; a line it cannot read adds none. */
  readonly push: (line: string) => ReadonlyArray<TranscriptEntry>;
  readonly entries: () => ReadonlyArray<TranscriptEntry>;
}

export type ToolEntry = Extract<TranscriptEntry, { type: 'tool' }>;

export interface ToolSummary {
  readonly verb: ToolVerb;
  readonly target?: string | undefined;
  readonly added?: number | undefined;
}

// A command in the one-line summary is cut to its first line and this many characters.
const MAX_TARGET = 80;

/** The first line of a command, cut to fit one line, with an ellipsis when something was cut. */
export const oneLine = (text: string): string => {
  const first = text.split('\n')[0] ?? '';
  const cut = first.length > MAX_TARGET ? first.slice(0, MAX_TARGET) : first;
  return cut === text ? text : `${cut.trimEnd()} …`;
};

/** A path inside the working directory is shown relative to it; any other path stays whole. */
export const relativeTo = (cwd: string | undefined, path: string): string =>
  cwd !== undefined && path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path;

export const lineCount = (text: string): number => (text === '' ? 0 : text.split('\n').length);

/** Lines added and removed by a diff whose changed lines start with `+` or `-`. */
export const diffCounts = (lines: ReadonlyArray<string>) => ({
  added: lines.filter((line) => line.startsWith('+')).length,
  removed: lines.filter((line) => line.startsWith('-')).length,
});

export const stringField = (record: unknown, key: string): string | undefined => {
  if (typeof record !== 'object' || record === null || !(key in record)) return undefined;
  const value: unknown = Reflect.get(record, key);
  return typeof value === 'string' ? value : undefined;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseLine = (line: string): Record<string, unknown> | undefined => {
  if (line.trim() === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    // A line that is still being written, or not JSON at all, carries no entry.
    return undefined;
  }
};

/**
 * The bookkeeping both formats share: entries in file order, and tool calls found by id, so a
 * later result can set their outcome.
 */
export const entryLog = () => {
  const entries: Array<TranscriptEntry> = [];
  const tools = new Map<string, number>();
  return {
    entries: (): ReadonlyArray<TranscriptEntry> => entries,
    add: (entry: TranscriptEntry): TranscriptEntry => {
      if (entry.type === 'tool') tools.set(entry.id, entries.length);
      entries.push(entry);
      return entry;
    },
    /** Sets the outcome of a tool call, and the line counts a result reports; none for an unknown id. */
    finish: (
      id: string,
      outcome: ToolOutcome,
      counts?: { readonly added: number; readonly removed: number },
    ): TranscriptEntry | undefined => {
      const index = tools.get(id);
      const entry = index === undefined ? undefined : entries[index];
      if (index === undefined || entry?.type !== 'tool') return undefined;
      const finished: ToolEntry = { ...entry, outcome, ...counts };
      entries[index] = finished;
      return finished;
    },
  };
};
