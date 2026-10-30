import * as Schema from 'effect/Schema';

export const AgentStatus = Schema.Literals(['working', 'blocked', 'done', 'idle', 'unknown']);
export type AgentStatus = typeof AgentStatus.Type;

/** The session file formats the app can render as a chat. */
export type TranscriptFormat = 'claude' | 'pi';

/** A live agent in a Herdr pane, as Herdr reports it. */
export interface Agent {
  readonly paneId: string;
  /** The Herdr name; an agent without one is addressed by its pane id. */
  readonly name: string | undefined;
  /** The agent program Herdr detected, such as `claude` or `pi`. */
  readonly kind: string | undefined;
  readonly status: AgentStatus;
  /** The terminal title, without the agent's status glyph. */
  readonly title: string;
  readonly workspaceId: string;
  readonly cwd: string | undefined;
  /** The agent's own session id, which names its session file. */
  readonly session: string | undefined;
  /** Herdr's counter of finished turns; it grows with each completion. */
  readonly completion: number | undefined;
}

/** How the app and Herdr address an agent: its name, or its pane id when it has none. */
export const agentRef = (agent: Agent): string => agent.name ?? agent.paneId;

/** Names one completion of one agent, so the app can remember that it was shown. */
export const completionKey = (agent: Pick<Agent, 'paneId' | 'completion'>): string =>
  `${agent.paneId}#${agent.completion ?? 0}`;

/** The format of the agent's session file, or `undefined` when the app shows only its screen. */
export const transcriptFormatOf = (agent: Agent): TranscriptFormat | undefined =>
  agent.kind === 'claude' || agent.kind === 'pi' ? agent.kind : undefined;
