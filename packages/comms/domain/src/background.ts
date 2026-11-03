/** What an agent left running while it carries on or waits at its prompt. */
export type BackgroundKind = 'shell' | 'monitor' | 'subagent';

/** One piece of an agent's background work, from its start until it ends. Times are epoch ms. */
export interface BackgroundItem {
  /** The tool call that started it. */
  readonly id: string;
  readonly kind: BackgroundKind;
  readonly description: string;
  readonly startedAt: number;
  /** False only for a subagent the agent waits on before it continues. */
  readonly inBackground: boolean;
  /** When a monitor stops by itself, as it announced on start. */
  readonly expiresAt?: number | undefined;
  /** The subagent's id, once known; it names the subagent's own conversation. */
  readonly subagent?: string | undefined;
}

/** The items still running at `now`, oldest first. A shell has no time limit of its own. */
export const runningAt = (
  items: ReadonlyArray<BackgroundItem>,
  now: number,
): ReadonlyArray<BackgroundItem> =>
  items
    .filter((item) => item.expiresAt === undefined || item.expiresAt > now)
    .sort((a, b) => a.startedAt - b.startedAt);
