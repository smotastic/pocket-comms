import { agentRef, completionKey, type Agent } from './agent.js';
import type { TranscriptEntry } from './transcript.js';

/** Why an agent waits for the owner: it asks something, or it finished a turn. */
export type Attention = 'blocked' | 'done';

/** An agent that has just started to wait for the owner; a done one names its completion. */
export type Change =
  | { readonly paneId: string; readonly attention: 'blocked' }
  | {
      readonly paneId: string;
      readonly attention: 'done';
      readonly completion: number | undefined;
    };

/** What the watcher last saw of each agent, by pane id. */
export type Reading = ReadonlyMap<string, Pick<Agent, 'status' | 'completion'>>;

/** The longest notification body, with the `…` that marks a cut. */
export const MAX_EXCERPT_LENGTH = 120;

const changeOf = (
  before: Pick<Agent, 'status' | 'completion'> | undefined,
  agent: Agent,
): Change | undefined => {
  if (agent.status === 'blocked' && before?.status !== 'blocked') {
    return { paneId: agent.paneId, attention: 'blocked' };
  }
  // A finished turn has a new completion, or follows a working agent when Herdr has no counter.
  // A done agent that was idle with the same completion was only flipped back: no new turn.
  const newTurn =
    before === undefined ||
    before.completion !== agent.completion ||
    (before.status !== 'done' && before.status !== 'idle');
  if (agent.status === 'done' && newTurn) {
    return { paneId: agent.paneId, attention: 'done', completion: agent.completion };
  }
  return undefined;
};

/**
 * Compares the agents with the previous reading. Without one, the agents only become the
 * baseline: what is already waiting when the server starts is not news. An agent that left is
 * forgotten, so it counts as new when it comes back.
 */
export const watchStep = (
  previous: Reading | undefined,
  agents: ReadonlyArray<Agent>,
): { readonly reading: Reading; readonly changes: ReadonlyArray<Change> } => ({
  reading: new Map(
    agents.map((agent) => [agent.paneId, { status: agent.status, completion: agent.completion }]),
  ),
  changes:
    previous === undefined
      ? []
      : agents.flatMap((agent) => changeOf(previous.get(agent.paneId), agent) ?? []),
});

/**
 * Whether a change is still true: the agent is still blocked, or still done with the same
 * completion and the owner has not seen it in the app.
 */
export const stillHolds = (
  change: Change,
  agents: ReadonlyArray<Agent>,
  seen: ReadonlySet<string>,
): boolean => {
  const agent = agents.find((candidate) => candidate.paneId === change.paneId);
  if (agent === undefined) return false;
  if (change.attention === 'blocked') return agent.status === 'blocked';
  return (
    agent.status === 'done' &&
    agent.completion === change.completion &&
    !seen.has(completionKey(agent))
  );
};

const oneLine = (text: string) => text.replace(/\s+/gu, ' ').trim();

// Counts and cuts by code points, so an emoji is never split into a broken character.
const cut = (text: string) => {
  const characters = Array.from(text);
  return characters.length <= MAX_EXCERPT_LENGTH
    ? text
    : `${characters.slice(0, MAX_EXCERPT_LENGTH - 1).join('')}…`;
};

/** The open question of a blocked agent, or the last message of a done one, on one line. */
export const excerptOf = (
  attention: Attention,
  entries: ReadonlyArray<TranscriptEntry>,
): string | undefined => {
  const latest = [...entries]
    .reverse()
    .find((entry) =>
      attention === 'blocked'
        ? entry.type === 'tool' && entry.outcome === 'pending' && entry.questions !== undefined
        : entry.type === 'assistant',
    );
  if (latest?.type === 'assistant') return oneLine(latest.text);
  const question = latest?.type === 'tool' ? latest.questions?.[0]?.text : undefined;
  return question === undefined ? undefined : oneLine(question);
};

/** A notification as a device shows it: `tag` lets a newer one replace it, `url` is opened. */
export interface Notification {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly url: string;
}

export const notificationOf = ({
  agent,
  attention,
  project,
  excerpt,
}: {
  readonly agent: Agent;
  readonly attention: Attention;
  readonly project: string | undefined;
  readonly excerpt: string | undefined;
}): Notification => {
  const ref = agentRef(agent);
  return {
    title: attention === 'blocked' ? `${ref} needs you` : `${ref} is done`,
    body: cut([project, excerpt].filter((part) => part !== undefined).join('\n')),
    tag: agent.paneId,
    url: `/agents/${encodeURIComponent(ref)}?from=push`,
  };
};

/** Where and how the server reaches one device's browser with a push. */
export interface PushSubscription {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}
