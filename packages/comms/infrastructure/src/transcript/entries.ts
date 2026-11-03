import type {
  BackgroundItem,
  ToolOutcome,
  ToolVerb,
  TranscriptEntry,
} from '@pocket-comms/comms-domain';

/** Reads one session file line by line and keeps the chat entries it found so far. */
export interface TranscriptParser {
  /** Reads one line and returns the entries it added or changed; a line it cannot read adds none. */
  readonly push: (line: string) => ReadonlyArray<TranscriptEntry>;
  readonly entries: () => ReadonlyArray<TranscriptEntry>;
  /** The background work started in the lines read so far that has not ended yet. */
  readonly background: () => ReadonlyArray<BackgroundItem>;
}

export type ToolEntry = Extract<TranscriptEntry, { type: 'tool' }>;

export interface ToolSummary {
  readonly verb: ToolVerb;
  readonly target?: string | undefined;
  readonly added?: number | undefined;
  readonly questions?: ToolEntry['questions'];
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
    /** The latest entry, which a later line may still complete. */
    last: (): TranscriptEntry | undefined => entries[entries.length - 1],
    /** Puts `entry` in place of the latest entry, which has the same id. */
    replaceLast: (entry: TranscriptEntry): TranscriptEntry => {
      entries[entries.length - 1] = entry;
      return entry;
    },
    /**
     * Sets the outcome of a tool call, what its result reports (line counts, the subagent it
     * started) and the answers to its questions, each found by the question's text; none for an
     * unknown id.
     */
    finish: (
      id: string,
      outcome: ToolOutcome,
      details?: Pick<ToolEntry, 'added' | 'removed' | 'subagent'>,
      answerOf: (question: string) => string | undefined = () => undefined,
    ): TranscriptEntry | undefined => {
      const index = tools.get(id);
      const entry = index === undefined ? undefined : entries[index];
      if (index === undefined || entry?.type !== 'tool') return undefined;
      const questions = entry.questions?.map((question) => {
        const answer = answerOf(question.text);
        return answer === undefined ? question : { ...question, answer };
      });
      const finished: ToolEntry = {
        ...entry,
        outcome,
        ...details,
        ...(questions === undefined ? {} : { questions }),
      };
      entries[index] = finished;
      return finished;
    },
  };
};
