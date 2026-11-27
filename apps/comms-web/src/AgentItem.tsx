import { AgentRow, type Hue } from '@smotastic/pocket-design';
import { useQuery } from '@tanstack/react-query';
import { backgroundMarker } from './background.js';
import type { AgentView, MissionsView } from './comms-client.js';
import { missionsKey } from './comms-queries.js';
import { STATUS_LABELS } from './labels.js';
import { planetLabel, rowName, rowWorktree } from './rows.js';
import { since } from './since.js';
import { statusDot } from './StatusBadge.js';

const needsYouToneOf = (agent: AgentView) =>
  agent.status === 'blocked'
    ? { attention: 'danger' as const }
    : agent.needsYou
      ? { attention: 'success' as const }
      : {};

/** One agent as a row that opens its conversation, tinted when it needs the owner. */
export const AgentItem = ({
  agent,
  hue,
  withPlanet,
  now,
}: {
  readonly agent: AgentView;
  readonly hue: Hue;
  /** Shows the planet before the title; a list of one planet's agents leaves it out. */
  readonly withPlanet: boolean;
  readonly now: number;
}) => {
  const worktree = rowWorktree(agent);
  // Reads Mission Control from the cache the start screen fills; it never asks the server itself.
  const missions = useQuery<MissionsView>({ queryKey: missionsKey, enabled: false });
  const onMission = agent.name !== undefined && missions.data?.running?.agent === agent.name;
  return (
    <AgentRow
      href={`/agents/${encodeURIComponent(agent.ref)}`}
      status={statusDot(agent.status, STATUS_LABELS[agent.status])}
      name={rowName(agent)}
      {...(worktree === undefined ? {} : { worktree })}
      {...(withPlanet ? { project: planetLabel(agent) } : {})}
      hue={hue}
      title={onMission ? `Mission · ${agent.title}` : agent.title}
      since={since(agent.changedAt, now)}
      {...needsYouToneOf(agent)}
      {...backgroundMarker(agent)}
    />
  );
};
