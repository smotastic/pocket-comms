import { AgentRow } from './AgentRow.js';
import { backgroundMarker } from './background.js';
import type { AgentView } from './comms-client.js';
import { STATUS_LABELS } from './labels.js';
import { projectLabel, rowName, rowWorktree } from './rows.js';
import { since } from './since.js';

/** One agent as a row that opens its conversation. */
export const AgentItem = ({
  agent,
  withProject,
  now,
  onOpen,
}: {
  readonly agent: AgentView;
  /** Shows the project before the title; a list of one project's agents leaves it out. */
  readonly withProject: boolean;
  readonly now: number;
  readonly onOpen: (ref: string) => void;
}) => {
  const worktree = rowWorktree(agent);
  return (
    <AgentRow
      href={`/agents/${encodeURIComponent(agent.ref)}`}
      onNavigate={() => onOpen(agent.ref)}
      status={{ tone: agent.status, label: STATUS_LABELS[agent.status] }}
      name={rowName(agent)}
      {...(worktree === undefined ? {} : { worktree })}
      {...(withProject ? { project: projectLabel(agent) } : {})}
      title={agent.title}
      since={since(agent.changedAt, now)}
      {...backgroundMarker(agent)}
    />
  );
};
