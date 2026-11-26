import { HUES, type Hue } from '@smotastic/pocket-design';
import type { AgentView } from './comms-client.js';

/** The key of the group of every agent without a planet. */
export const OTHER_KEY = 'other';

/** The name of a row: the agent's Herdr name, or its workspace label. */
export const rowName = (agent: AgentView) => agent.name ?? agent.workspace;

/** The worktree after a row's name; none for a main checkout or one that repeats the name. */
export const rowWorktree = (agent: AgentView) =>
  agent.worktree === rowName(agent) ? undefined : agent.worktree;

/** The label before a row's title: the planet, or the workspace of an agent without one. */
export const planetLabel = (agent: AgentView) => agent.planet ?? agent.workspace;

/**
 * A planet's colour, by its place in the list of planets so that the first few never share
 * one. A planet outside the list, and no planet, are neutral.
 */
export const planetHue = (planet: string | undefined, planets: ReadonlyArray<string>): Hue => {
  const index = planet === undefined ? -1 : planets.indexOf(planet);
  return index === -1 ? 'neutral' : (HUES[index % HUES.length] ?? 'neutral');
};
