import type { AgentView } from './comms-client.js';

/** The key of the group of every agent without a project. */
export const OTHER_KEY = 'other';

/** Where a row is shown: the Needs you card, a project's card or the Other card. */
export type RowSection = 'needsYou' | 'project' | 'other';

/** The name of a row: the agent's Herdr name, or its workspace label (spec 007, requirement 6). */
export const rowName = (agent: AgentView) => agent.name ?? agent.workspace;

const tagOf = (agent: AgentView, section: RowSection) => {
  if (section === 'other' || agent.project === undefined) return agent.workspace;
  if (section === 'project') return agent.worktree;
  return agent.worktree === undefined ? agent.project : `${agent.project} · ${agent.worktree}`;
};

/** The tag before a row's title (spec 007, requirement 7); never one that repeats the name. */
export const rowTag = (agent: AgentView, section: RowSection) => {
  const tag = tagOf(agent, section);
  return tag === rowName(agent) ? undefined : tag;
};
