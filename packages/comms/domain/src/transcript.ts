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

/** One question an agent asked the owner, and the answer they chose once known. */
export interface Question {
  /** A short label of the question, such as "Stack". */
  readonly header?: string | undefined;
  readonly text: string;
  /** The chosen option's label, several joined with ", ", or what the owner typed. */
  readonly answer?: string | undefined;
}

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
      /**
       * The questions a call asked the owner, in order: the call is `pending` while they wait,
       * `ok` once answered and `error` when they never answered.
       */
      readonly questions?: ReadonlyArray<Question> | undefined;
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
 * What a working agent is doing, from its latest entry: the step it runs, the owner's answer it
 * waits for, or "Thinking…" while it writes a reply or decides on the next step.
 */
export const activityOf = (entries: ReadonlyArray<TranscriptEntry>): string => {
  const latest = entries.at(-1);
  if (latest?.type !== 'tool' || latest.outcome !== 'pending') return 'Thinking…';
  if (latest.questions !== undefined) return 'Waiting for your answer…';
  const target = latest.target === undefined ? '' : ` ${latest.target}`;
  return `${PRESENT[latest.verb]}${target}…`;
};
