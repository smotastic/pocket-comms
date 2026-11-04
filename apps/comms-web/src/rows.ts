import type { AgentView } from './comms-client.js';

/** The key of the group of every agent without a project. */
export const OTHER_KEY = 'other';

/** The name of a row: the agent's Herdr name, or its workspace label. */
export const rowName = (agent: AgentView) => agent.name ?? agent.workspace;

/** The worktree after a row's name; none for a main checkout or one that repeats the name. */
export const rowWorktree = (agent: AgentView) =>
  agent.worktree === rowName(agent) ? undefined : agent.worktree;

/** The label before a row's title: the project, or the workspace of an agent without one. */
export const projectLabel = (agent: AgentView) => agent.project ?? agent.workspace;
