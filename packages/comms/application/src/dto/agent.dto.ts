import type { AgentStatus, TranscriptEntry, TranscriptFormat } from '@pocket-comms/comms-domain';

/** An agent as the app shows it. */
export interface AgentDto {
  /** The agent's name, or its pane id when it has none; it addresses the agent in the API. */
  readonly ref: string;
  readonly paneId: string;
  readonly name: string | undefined;
  readonly kind: string | undefined;
  /** The session format the app renders as a chat; none means the app shows only the screen. */
  readonly format: TranscriptFormat | undefined;
  readonly status: AgentStatus;
  readonly title: string;
  readonly cwd: string | undefined;
  readonly workspace: string;
  /** When the agent last changed, in epoch milliseconds. */
  readonly changedAt: number;
  readonly needsYou: boolean;
}

export interface OverviewGroupDto {
  readonly key: string;
  readonly name: string;
  readonly agents: ReadonlyArray<AgentDto>;
}

export interface OverviewDto {
  readonly needsYou: ReadonlyArray<AgentDto>;
  readonly groups: ReadonlyArray<OverviewGroupDto>;
}

export interface TranscriptDto {
  readonly entries: ReadonlyArray<TranscriptEntry>;
  /** What a working agent does now, such as "Running pnpm test…". */
  readonly activity: string;
}

/** One update of an open conversation. */
export type AgentEventDto =
  | { readonly type: 'agent'; readonly agent: AgentDto }
  | {
      readonly type: 'entries';
      /** The entries replace what the reader holds: the first event of a session. */
      readonly reset: boolean;
      readonly entries: ReadonlyArray<TranscriptEntry>;
      readonly activity: string;
    };

/** The overview as a live stream sees it: available, or Herdr cannot be reached. */
export type OverviewStateDto =
  | { readonly _tag: 'Available'; readonly overview: OverviewDto }
  | { readonly _tag: 'Unavailable'; readonly reason: string };
