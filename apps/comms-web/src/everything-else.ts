import type { OverviewView } from './comms-client.js';

/** The filter's value that shows every agent; a group key is a path or `other`, never this. */
export const ALL = '*';

type Group = OverviewView['groups'][number];

/** Every agent outside Needs you, by project in the overview's order, those without one last. */
export const agentsOf = (groups: ReadonlyArray<Group>, chosen: string = ALL) =>
  (chosen === ALL ? groups : groups.filter((group) => group.key === chosen)).flatMap(
    (group) => group.agents,
  );

/** The filter's value: the chosen group while it still has agents, else All. */
export const activeFilter = (groups: ReadonlyArray<Group>, chosen: string) =>
  groups.some((group) => group.key === chosen) ? chosen : ALL;
