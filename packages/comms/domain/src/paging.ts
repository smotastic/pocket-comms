import type { Agent } from './agent.js';
import type { AgentKey } from './input.js';

// Page Up scrolls a long question of a waiting agent so the owner can read its start. The agent's
// question then leaves its screen, and Herdr reads the screen as a finished turn: done, and then
// idle. The agent still waits for the owner, so the app, the timeline and the notifications keep
// it waiting until Herdr reports another status, such as blocked once the question is back, or
// until the owner does anything but page, such as answer or cancel the question.

const PAGE_KEYS: ReadonlyArray<AgentKey> = ['pageup', 'pagedown'];

/**
 * Whether the agent is paged away from its question after `keys`: Page Up scrolls a waiting agent
 * away, paging keeps it away, and any other key ends it.
 */
export const pagedAwayAfter = (
  keys: ReadonlyArray<AgentKey>,
  agent: Agent | undefined,
  pagedAway: boolean,
): boolean => {
  if (keys.some((key) => !PAGE_KEYS.includes(key))) return false;
  return pagedAway || (agent?.status === 'blocked' && keys.includes('pageup'));
};

/**
 * The agent as it is while paged away from its question: still waiting, as `waiting` was when the
 * owner paged away, while Herdr reports it done or idle. `pagedAway` is false once Herdr reports
 * another status, and `agent` is then Herdr's own.
 */
export const whilePagedAway = (
  agent: Agent,
  waiting: Agent,
): { readonly agent: Agent; readonly pagedAway: boolean } =>
  agent.status === 'done' || agent.status === 'idle'
    ? {
        agent: { ...agent, status: waiting.status, completion: waiting.completion },
        pagedAway: true,
      }
    : { agent, pagedAway: false };
