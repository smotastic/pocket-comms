import { AgentRow, type Hue } from '@pocket-comms/design-ui';
import type { AgentView } from './comms-client.js';
import { STATUS_LABELS } from './labels.js';
import { projectLabel, rowName, rowWorktree } from './rows.js';
import { since } from './since.js';

const attentionOf = (agent: AgentView) =>
  agent.status === 'blocked'
    ? { attention: 'blocked' as const }
    : agent.needsYou
      ? { attention: 'done' as const }
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
      onNavigate={() => onOpen(agent.ref)}
      status={{ tone: agent.status, label: STATUS_LABELS[agent.status] }}
      name={rowName(agent)}
      {...(worktree === undefined ? {} : { worktree })}
      {...(withProject ? { project: projectLabel(agent) } : {})}
      hue={hue}
      title={agent.title}
      since={since(agent.changedAt, now)}
      {...attentionOf(agent)}
    />
  );
};
