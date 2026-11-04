import { AgentRow, type Hue } from '@smotastic/pocket-design';
import { backgroundMarker } from './background.js';
import type { AgentView } from './comms-client.js';
import { STATUS_LABELS } from './labels.js';
import { navigateOnPlainClick } from './links.js';
import { projectLabel, rowName, rowWorktree } from './rows.js';
import { since } from './since.js';
import { statusDot } from './StatusBadge.js';

const attentionOf = (agent: AgentView) =>
  agent.status === 'blocked'
    ? { attention: 'danger' as const }
    : agent.needsYou
      ? { attention: 'success' as const }
      : {};

/** One agent as a row that opens its conversation, tinted when it needs the owner. */
export const AgentItem = ({
  agent,
  hue,
  withProject,
  now,
  onOpen,
}: {
  readonly agent: AgentView;
  readonly hue: Hue;
  /** Shows the project before the title; a list of one project's agents leaves it out. */
  readonly withProject: boolean;
  readonly now: number;
  readonly onOpen: (ref: string) => void;
}) => {
  const worktree = rowWorktree(agent);
  return (
    <AgentRow
      href={`/agents/${encodeURIComponent(agent.ref)}`}
      onClick={navigateOnPlainClick(() => onOpen(agent.ref))}
      status={statusDot(agent.status, STATUS_LABELS[agent.status])}
      name={rowName(agent)}
      {...(worktree === undefined ? {} : { worktree })}
      {...(withProject ? { project: projectLabel(agent) } : {})}
      hue={hue}
      title={agent.title}
      since={since(agent.changedAt, now)}
      {...attentionOf(agent)}
      {...backgroundMarker(agent)}
    />
  );
};
