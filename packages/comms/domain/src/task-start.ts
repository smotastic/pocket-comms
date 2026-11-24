import type { Agent } from './agent.js';
import type { AgentToStart } from './task.js';

// A task start (spec 032): a task whose worktree exists and whose agent should get the first
// prompt. It is kept, by its worktree folder, until the agent has the prompt, so the owner can
// send it later into the same worktree and agent.

/** Where the first prompt of a task start is. */
export type Delivery = 'pending' | 'not-started' | 'not-sent' | 'uncertain' | 'delivered';

export interface TaskStart {
  /** The worktree folder; an agent whose `cwd` is in it belongs to the start. */
  readonly folder: string;
  readonly project: string;
  readonly branch: string;
  readonly issue: number | undefined;
  readonly kind: AgentToStart;
  /** The started agent's name, when it was started. */
  readonly agent: string | undefined;
  /** The first prompt exactly as it is sent. */
  readonly prompt: string;
  readonly delivery: Delivery;
  /** Why the prompt was not delivered, in words for the owner. */
  readonly reason: string | undefined;
  /** When the start last changed, in epoch milliseconds. */
  readonly at: number;
}

/** How Herdr took a prompt: accepted, refused with a reason, or not answered at all. */
export type PromptOutcome =
  | { readonly _tag: 'Accepted' }
  | { readonly _tag: 'Refused'; readonly reason: string }
  | { readonly _tag: 'Unanswered'; readonly reason: string };

/** A refused prompt did not arrive; an unanswered one may have, so it is never sent again unasked. */
export const deliveryOf = (
  outcome: PromptOutcome,
): { readonly delivery: Delivery; readonly reason: string | undefined } => {
  switch (outcome._tag) {
    case 'Accepted':
      return { delivery: 'delivered', reason: undefined };
    case 'Refused':
      return { delivery: 'not-sent', reason: outcome.reason };
    case 'Unanswered':
      return { delivery: 'uncertain', reason: outcome.reason };
  }
};

/** A start the server was still working on when it stopped may or may not have sent its prompt. */
export const afterRestart = (starts: ReadonlyArray<TaskStart>): ReadonlyArray<TaskStart> =>
  starts.map((each) =>
    each.delivery === 'pending' ? { ...each, delivery: 'uncertain' as const } : each,
  );

/** Whether `cwd` is the folder `path` or lies in it. */
export const isInFolder = (cwd: string | undefined, path: string): boolean =>
  cwd !== undefined && (cwd === path || cwd.startsWith(`${path}/`));

/**
 * The start of `agent`'s worktree. In a worktree with several live agents (`agents`), only the
 * agent the start names gets it, so the prompt is never offered to a helper the owner started.
 */
export const startFor = (
  starts: ReadonlyArray<TaskStart>,
  agent: Agent,
  agents: ReadonlyArray<Agent>,
): TaskStart | undefined => {
  const kept = starts.find((each) => isInFolder(agent.cwd, each.folder));
  if (kept === undefined) return undefined;
  const inFolder = agents.filter((each) => isInFolder(each.cwd, kept.folder));
  return inFolder.length <= 1 || kept.agent === agent.name ? kept : undefined;
};

/**
 * What an issue's worktree offers to recover: nothing while a start runs. A live agent without a
 * kept start may or may not have its task, so it is only offered the issue's task to send.
 */
export type Recovery = 'resume' | 'start-agent' | 'send-issue-task';

export const recoveryOf = (
  work: { readonly path: string; readonly agents: ReadonlyArray<Agent> },
  start: TaskStart | undefined,
): Recovery | undefined => {
  if (start?.delivery === 'pending') return undefined;
  if (work.agents.length === 0) return 'start-agent';
  if (start === undefined) return 'send-issue-task';
  return start.delivery === 'delivered' ? undefined : 'resume';
};
