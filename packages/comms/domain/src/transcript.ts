/** What a tool call did, as the one-line summary names it. */
export type ToolVerb =
  | 'Ran'
  | 'Edited'
  | 'Wrote'
  | 'Read'
  | 'Searched'
  | 'Fetched'
  | 'Delegated'
  | 'Used';

export type ToolOutcome = 'ok' | 'error' | 'pending';

/** One entry of an agent's conversation, as the chat shows it. `at` is in epoch milliseconds. */
export type TranscriptEntry =
  | { readonly type: 'user'; readonly id: string; readonly at: number; readonly text: string }
  /** `text` is Markdown. */
  | { readonly type: 'assistant'; readonly id: string; readonly at: number; readonly text: string }
  | {
      readonly type: 'tool';
      readonly id: string;
      readonly at: number;
      readonly verb: ToolVerb;
      /** The file, command or name the call worked on. */
      readonly target?: string | undefined;
      /** Lines added and removed by an edit. */
      readonly added?: number | undefined;
      readonly removed?: number | undefined;
      readonly outcome: ToolOutcome;
    };

const PRESENT: Record<ToolVerb, string> = {
  Ran: 'Running',
  Edited: 'Editing',
  Wrote: 'Writing',
  Read: 'Reading',
  Searched: 'Searching',
  Fetched: 'Fetching',
  Delegated: 'Delegating',
  Used: 'Using',
};

/**
 * What a working agent is doing, from its latest entry: the step it runs, or "Thinking…" while
 * it writes a reply or decides on the next step.
 */
export const activityOf = (entries: ReadonlyArray<TranscriptEntry>): string => {
  const latest = entries.at(-1);
  if (latest?.type !== 'tool' || latest.outcome !== 'pending') return 'Thinking…';
  const target = latest.target === undefined ? '' : ` ${latest.target}`;
  return `${PRESENT[latest.verb]}${target}…`;
};
