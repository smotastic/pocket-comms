import { completionKey, type Agent } from './agent.js';
import { OTHER_GROUP, type Workspace, type WorkspaceGroup } from './workspace.js';

export interface OverviewGroup<A extends Agent = Agent> extends WorkspaceGroup {
  readonly agents: ReadonlyArray<A>;
}

export interface Overview<A extends Agent = Agent> {
  /**
   * Blocked agents, then done agents whose completion the owner has not seen and that have no
   * background work running.
   */
  readonly needsYou: ReadonlyArray<A>;
  /**
   * Every other agent, by repository group in Herdr's workspace order, then the Other group of
   * every workspace without a project; no group is empty.
   */
  readonly groups: ReadonlyArray<OverviewGroup<A>>;
}

/**
 * Whether an agent waits for the owner: it is blocked, or it is done, that was not seen yet, and
 * nothing it started still runs. A done agent with running work wakes up by itself when it ends.
 */
export const needsYou = (agent: Agent, seen: ReadonlySet<string>, running: number): boolean =>
  agent.status === 'blocked' ||
  (agent.status === 'done' && running === 0 && !seen.has(completionKey(agent)));

/**
 * Sorts the agents for the overview. Agents keep Herdr's order within a section; an agent in a
 * workspace Herdr did not list belongs to the Other group. `runningOf` counts an agent's running
 * background work.
 */
export const buildOverview = <A extends Agent>(
  agents: ReadonlyArray<A>,
  workspaces: ReadonlyArray<Workspace>,
  seen: ReadonlySet<string>,
  runningOf: (agent: A) => number = () => 0,
): Overview<A> => {
  const attention = agents.filter((agent) => needsYou(agent, seen, runningOf(agent)));
  const rest = agents.filter((agent) => !needsYou(agent, seen, runningOf(agent)));

  const groupOf = new Map(workspaces.map((workspace) => [workspace.id, workspace.group]));
  const groups = new Map<string, { group: WorkspaceGroup; agents: Array<A> }>();
  for (const workspace of workspaces) {
    if (!groups.has(workspace.group.key)) {
      groups.set(workspace.group.key, { group: workspace.group, agents: [] });
    }
  }
  for (const agent of rest) {
    const group = groupOf.get(agent.workspaceId) ?? OTHER_GROUP;
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
      .sort(
        (a, b) => Number(a.group.key === OTHER_GROUP.key) - Number(b.group.key === OTHER_GROUP.key),
      )
      .map((entry) => ({ ...entry.group, agents: entry.agents })),
  };
};
