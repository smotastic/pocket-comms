import { completionKey, type Agent } from './agent.js';
import { ownGroup, type Workspace, type WorkspaceGroup } from './workspace.js';

export interface OverviewGroup<A extends Agent = Agent> extends WorkspaceGroup {
  readonly agents: ReadonlyArray<A>;
}

export interface Overview<A extends Agent = Agent> {
  /** Blocked agents, then done agents whose completion the owner has not seen. */
  readonly needsYou: ReadonlyArray<A>;
  /** Every other agent, by repository group in Herdr's workspace order; no group is empty. */
  readonly groups: ReadonlyArray<OverviewGroup<A>>;
}

/** Whether an agent waits for the owner: it is blocked, or it is done and that was not seen yet. */
export const needsYou = (agent: Agent, seen: ReadonlySet<string>): boolean =>
  agent.status === 'blocked' || (agent.status === 'done' && !seen.has(completionKey(agent)));

/**
 * Sorts the agents for the overview. Agents keep Herdr's order within a section; an agent in a
 * workspace Herdr did not list gets a group of its own after the known ones.
 */
export const buildOverview = <A extends Agent>(
  agents: ReadonlyArray<A>,
  workspaces: ReadonlyArray<Workspace>,
  seen: ReadonlySet<string>,
): Overview<A> => {
  const attention = agents.filter((agent) => needsYou(agent, seen));
  const rest = agents.filter((agent) => !needsYou(agent, seen));

  const groupOf = new Map(workspaces.map((workspace) => [workspace.id, workspace.group]));
  const groups = new Map<string, { group: WorkspaceGroup; agents: Array<A> }>();
  for (const workspace of workspaces) {
    if (!groups.has(workspace.group.key)) {
      groups.set(workspace.group.key, { group: workspace.group, agents: [] });
    }
  }
  for (const agent of rest) {
    const group = groupOf.get(agent.workspaceId) ?? ownGroup(agent.workspaceId, agent.workspaceId);
    const entry = groups.get(group.key) ?? { group, agents: [] };
    entry.agents.push(agent);
    groups.set(group.key, entry);
  }

  return {
    needsYou: [
      ...attention.filter((agent) => agent.status === 'blocked'),
      ...attention.filter((agent) => agent.status !== 'blocked'),
    ],
    groups: [...groups.values()]
      .filter((entry) => entry.agents.length > 0)
      .map((entry) => ({ ...entry.group, agents: entry.agents })),
  };
};
