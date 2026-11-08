import type { AgentView } from './comms-client.js';
import type { ToolEntry, ToolLink } from './Chat.js';
import { since } from './since.js';

type BackgroundItem = AgentView['background'][number];

const KIND_LABELS: Record<BackgroundItem['kind'], string> = {
  shell: 'Command',
  monitor: 'Monitor',
  subagent: 'Subagent',
};

/** The address of a subagent's conversation. */
export const subagentPath = (ref: string, id: string) =>
  `/agents/${encodeURIComponent(ref)}/subagents/${encodeURIComponent(id)}`;

/** How a row names an agent's background work, or nothing without any. */
export const backgroundMarker = (agent: AgentView) =>
  agent.background.length === 0
    ? {}
    : {
        background: {
          count: agent.background.length,
          label: `${agent.background.length} running in the background`,
        },
      };

/** The strip's items: each piece of work, and the subagents as links to their conversations. */
export const stripItems = (agent: AgentView, now: number) =>
  agent.background.map((item) => {
    const subagent = item.subagent;
    return {
      id: item.id,
      kind: KIND_LABELS[item.kind],
      description: item.description,
      since: since(item.startedAt, now),
      ...(subagent === undefined ? {} : { href: subagentPath(agent.ref, subagent) }),
    };
  });

/**
 * A delegation's link to its subagent's conversation, with a note while the subagent runs. The
 * id comes from the call's result, or, while a subagent still runs, from the background work; a
 * subagent whose id is not known yet only gets the note.
 */
export const delegationLink =
  (agent: AgentView) =>
  (entry: ToolEntry): ToolLink | undefined => {
    if (entry.verb !== 'Delegated') return undefined;
    const running = agent.background.find((item) => item.id === entry.id);
    const subagent = entry.subagent ?? running?.subagent;
    const link: ToolLink = {
      ...(subagent === undefined ? {} : { href: subagentPath(agent.ref, subagent) }),
      ...(running === undefined
        ? {}
        : { hint: running.inBackground ? 'running in the background' : 'running' }),
    };
    return Object.keys(link).length === 0 ? undefined : link;
  };
