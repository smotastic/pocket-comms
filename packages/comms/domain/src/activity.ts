import { agentRef, type Agent } from './agent.js';
import type { AgentKey } from './input.js';
import type { Workspace } from './workspace.js';

/** The timeline keeps at most this many events. */
export const ACTIVITY_LIMIT = 100;

/** The timeline keeps events of the last 24 hours, in milliseconds. */
export const ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How much of a prompt's first line the timeline keeps. */
export const EXCERPT_LENGTH = 80;

/** The agent an event is about, as it was when the event happened. */
export interface ActivitySubject {
  readonly paneId: string;
  readonly ref: string;
  readonly name: string | undefined;
  readonly workspace: string;
  readonly project: string | undefined;
  readonly worktree: string | undefined;
}

/** The statuses whose start the timeline records; idle and unknown would be noise. */
export type RecordedStatus = 'working' | 'blocked' | 'done';

/** What happened to an agent. */
export type ActivityChange =
  | { readonly type: 'appeared' }
  | { readonly type: 'gone' }
  | { readonly type: 'status'; readonly status: RecordedStatus }
  /** The owner's prompt from the app: its first line, cut short, and its images. */
  | { readonly type: 'prompt'; readonly excerpt: string; readonly images: number }
  /** Keys the owner sent from the app, such as an approval. */
  | { readonly type: 'keys'; readonly keys: ReadonlyArray<AgentKey> }
  /** Text the owner typed into a waiting dialog from the app, cut short. */
  | { readonly type: 'typed'; readonly excerpt: string };

/** A change of one agent, before it gets its id and time. */
export type NewActivity = ActivityChange & { readonly agent: ActivitySubject };

/** One event of the timeline; `at` is in epoch milliseconds. */
export type ActivityEvent = NewActivity & { readonly id: string; readonly at: number };

/** A live agent with its subject, so a gone agent is still named as it was. */
export interface Observed {
  readonly agent: Agent;
  readonly subject: ActivitySubject;
}

export const activitySubject = (
  agent: Agent,
  workspace: Workspace | undefined,
): ActivitySubject => ({
  paneId: agent.paneId,
  ref: agentRef(agent),
  name: agent.name,
  workspace: workspace?.label ?? agent.workspaceId,
  project: workspace?.project,
  worktree: workspace?.worktree,
});

const isRecorded = (status: Agent['status']): status is RecordedStatus =>
  status === 'working' || status === 'blocked' || status === 'done';

// A done agent can finish another turn between two snapshots; its completion counter tells.
const statusChange = (before: Agent, after: Agent): RecordedStatus | undefined => {
  if (!isRecorded(after.status)) return undefined;
  if (before.status !== after.status) return after.status;
  return after.status === 'done' && after.completion !== before.completion ? 'done' : undefined;
};

/** What changed between two snapshots of the agents: gone agents, new ones, then statuses. */
export const activityBetween = (
  before: ReadonlyArray<Observed>,
  after: ReadonlyArray<Observed>,
): ReadonlyArray<NewActivity> => {
  const earlier = new Map(before.map((seen) => [seen.agent.paneId, seen]));
  const later = new Set(after.map((seen) => seen.agent.paneId));
  const gone = before
    .filter((seen) => !later.has(seen.agent.paneId))
    .map((seen): NewActivity => ({ type: 'gone', agent: seen.subject }));
  const appeared = after
    .filter((seen) => !earlier.has(seen.agent.paneId))
    .map((seen): NewActivity => ({ type: 'appeared', agent: seen.subject }));
  const statuses = after.flatMap((seen): ReadonlyArray<NewActivity> => {
    const previous = earlier.get(seen.agent.paneId);
    const status = previous === undefined ? undefined : statusChange(previous.agent, seen.agent);
    return status === undefined ? [] : [{ type: 'status', status, agent: seen.subject }];
  });
  return [...gone, ...appeared, ...statuses];
};

/** The events the timeline keeps at `now`: the newest within the window, oldest first. */
export const keepActivity = (
  events: ReadonlyArray<ActivityEvent>,
  now: number,
): ReadonlyArray<ActivityEvent> =>
  events.filter((event) => event.at > now - ACTIVITY_WINDOW_MS).slice(-ACTIVITY_LIMIT);

/** The first line of a prompt that says something, with its white space collapsed, cut short. */
export const promptExcerpt = (text: string): string => {
  const line =
    text
      .split('\n')
      .map((part) => part.replace(/\s+/gu, ' ').trim())
      .find((part) => part !== '') ?? '';
  // Cut by code point, so an emoji at the cut is never left half.
  const characters = Array.from(line);
  return characters.length > EXCERPT_LENGTH
    ? `${characters.slice(0, EXCERPT_LENGTH - 1).join('')}…`
    : line;
};

/** Whether the agent of an event still runs: its pane runs an agent of the same name. */
export const isLiveIn = (subject: ActivitySubject, agents: ReadonlyArray<Agent>): boolean =>
  agents.some((agent) => agent.paneId === subject.paneId && agentRef(agent) === subject.ref);
