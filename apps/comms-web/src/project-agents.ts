import type { OverviewView } from './comms-client.js';
import { OTHER_KEY } from './rows.js';

/** The overview narrowed to one project's card and its agents in Needs you (spec 008). */
export const filterOverview = (overview: OverviewView, project: string): OverviewView => ({
  needsYou: overview.needsYou.filter((agent) => agent.project === project),
  groups: overview.groups.filter((group) => group.key !== OTHER_KEY && group.name === project),
});
