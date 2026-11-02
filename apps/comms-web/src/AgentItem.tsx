import { AgentRow, StatusPill } from '@pocket-comms/design-ui';
import type { AgentView } from './comms-client.js';
import { kindOf, STATUS_LABELS } from './labels.js';
import { rowName, rowTag, type RowSection } from './rows.js';
import { since } from './since.js';

const withTag = (tag: string | undefined) => (tag === undefined ? {} : { tag });

/** One agent as a row that opens its conversation, tagged for the section it is shown in. */
export const AgentItem = ({
  agent,
  section,
  now,
  onOpen,
}: {
  readonly agent: AgentView;
  readonly section: RowSection;
  readonly now: number;
  readonly onOpen: (ref: string) => void;
}) => (
  <AgentRow
    href={`/agents/${encodeURIComponent(agent.ref)}`}
    onNavigate={() => onOpen(agent.ref)}
    kind={kindOf(agent.kind)}
    name={rowName(agent)}
    status={<StatusPill tone={agent.status} label={STATUS_LABELS[agent.status]} />}
    detail={agent.status === 'blocked' ? 'Needs your answer' : agent.title}
    {...withTag(rowTag(agent, section))}
    since={since(agent.changedAt, now)}
    {...(agent.status === 'blocked'
      ? { attention: 'blocked' as const }
      : agent.needsYou
        ? { attention: 'done' as const }
        : {})}
  />
);
