import type { AgentView, OverviewView } from './comms-client.js';
import { OTHER_KEY } from './rows.js';

/** The filter value of the agents without a project; no repository can be named so. */
export const OTHER_CHOICE = '';

/** One entry of the filter sheet (spec 007, requirement 8). */
export interface ProjectChoice {
  /** The project's name, or `OTHER_CHOICE` for the agents without a project. */
  readonly value: string;
  readonly label: string;
  /** Its agents, those in Needs you included. */
  readonly count: number;
  /** Whether one of its agents is in Needs you. */
  readonly waiting: boolean;
}

const choiceOf = (agent: AgentView) => agent.project ?? OTHER_CHOICE;

const groupChoice = (group: OverviewView['groups'][number]) =>
  group.key === OTHER_KEY ? OTHER_CHOICE : group.name;

/**
 * Every project with an agent: the cards' projects in their order, then projects whose only
 * agents are in Needs you, and Other last.
 */
export const projectChoices = (overview: OverviewView): ReadonlyArray<ProjectChoice> => {
  const choices = new Map<string, { label: string; count: number; waiting: boolean }>();
  const entry = (value: string, label: string) => {
    const found = choices.get(value) ?? { label, count: 0, waiting: false };
    choices.set(value, found);
    return found;
  };
  for (const group of overview.groups) {
    entry(groupChoice(group), group.name).count += group.agents.length;
  }
  for (const agent of overview.needsYou) {
    const value = choiceOf(agent);
    const found = entry(value, value === OTHER_CHOICE ? 'Other' : value);
    found.count += 1;
    found.waiting = true;
  }
  return [...choices]
    .map(([value, choice]) => ({ value, ...choice }))
    .sort((a, b) => Number(a.value === OTHER_CHOICE) - Number(b.value === OTHER_CHOICE));
};

/** The overview narrowed to one project's card and its agents in Needs you; `undefined` is all. */
export const filterOverview = (
  overview: OverviewView,
  project: string | undefined,
): OverviewView =>
  project === undefined
    ? overview
    : {
        needsYou: overview.needsYou.filter((agent) => choiceOf(agent) === project),
        groups: overview.groups.filter((group) => groupChoice(group) === project),
      };
