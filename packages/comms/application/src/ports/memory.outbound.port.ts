import type { AgentStatus } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type * as Stream from 'effect/Stream';

/** The completions of `done` agents the owner has seen in the app (`completionKey`). */
export class SeenOutbound extends Context.Service<
  SeenOutbound,
  {
    readonly seen: Effect.Effect<ReadonlySet<string>>;
    readonly markSeen: (key: string) => Effect.Effect<void>;
    /** Emits after each change of the seen set. */
    readonly changes: Stream.Stream<void>;
  }
>()('comms/application/SeenOutbound') {}

/** The status the server last saw for an agent's pane, and when it saw it change. */
export interface StatusMark {
  readonly status: AgentStatus;
  /** Epoch milliseconds. */
  readonly since: number;
}

export class StatusHistoryOutbound extends Context.Service<
  StatusHistoryOutbound,
  {
    readonly get: (paneId: string) => Effect.Effect<Option.Option<StatusMark>>;
    readonly set: (paneId: string, mark: StatusMark) => Effect.Effect<void>;
  }
>()('comms/application/StatusHistoryOutbound') {}
