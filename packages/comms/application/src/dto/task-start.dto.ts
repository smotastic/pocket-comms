import type { AgentStatus, AgentToStart } from '@pocket-comms/comms-domain';

/** Where a task start's prompt is, as the conversation's card shows it (spec 032). */
export type TaskStartDelivery = 'pending' | 'not-started' | 'not-sent' | 'uncertain';

/** The task start of an agent's worktree, or the issue's task built for it. */
export interface TaskStartDto {
  /** `kept` for a start the server kept, `issue` for the issue's task built now. */
  readonly source: 'kept' | 'issue';
  readonly delivery: TaskStartDelivery;
  readonly reason: string | undefined;
  readonly prompt: string;
  readonly branch: string;
  readonly issue: number | undefined;
  /** The agent as Herdr reports it now: Send is offered only while it is idle and ready. */
  readonly agent: { readonly status: AgentStatus; readonly ready: boolean };
}

/** Send a task start's prompt, as the owner edited it. */
export interface SendTaskStartInput {
  readonly prompt: string;
  /** The owner saw that the prompt may have arrived and sends it anyway. */
  readonly anyway?: boolean | undefined;
  /** Send the issue's task when the worktree has no kept start. */
  readonly fromIssue?: boolean | undefined;
}

/** Where the prompt is after a send. */
export interface TaskStartSentDto {
  readonly delivery: 'delivered' | 'not-sent' | 'uncertain';
  readonly reason: string | undefined;
}

/** Start an agent in the existing worktree of an issue, on `branch`. */
export interface StartAgentInWorktreeInput {
  readonly planet: string;
  readonly number: number;
  readonly branch: string;
  readonly agent: AgentToStart;
}
