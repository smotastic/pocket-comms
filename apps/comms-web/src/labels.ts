import type { AgentView, OverviewStateView } from './comms-client.js';

/** The wording of each status, as the pill shows it (spec 004, requirement 4). */
export const STATUS_LABELS: Record<AgentView['status'], string> = {
  working: 'Working',
  blocked: 'Needs you',
  done: 'Done',
  idle: 'Idle',
  unknown: 'Unknown',
};

/** The multiplexer as the owner knows it (ADR 0015). */
export const MULTIPLEXER_NAMES: Record<OverviewStateView['multiplexer'], string> = {
  herdr: 'Herdr',
  hc: 'hc',
};

/** The kind tile of an agent: Claude, Pi, or the raw kind Herdr reports. */
export const kindOf = (kind: string | undefined) => {
  if (kind === 'claude') return { mark: 'C', label: 'Claude', tone: 'claude' } as const;
  if (kind === 'pi') return { mark: 'π', label: 'Pi', tone: 'pi' } as const;
  const label = kind ?? 'Agent';
  return { mark: label.charAt(0).toUpperCase(), label, tone: 'other' } as const;
};
