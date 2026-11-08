import type { BrainstormEntry, IssueRead } from '@pocket-comms/comms-domain';
import type { RuntimeState, StoredChatEntry } from '@smotastic/pocket-agent';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';

/**
 * The brainstorm chat as stored: its id, its entries numbered in order (spec 026), the issues Pi
 * last read, and Pi's own history.
 */
export interface StoredChat {
  readonly id: string;
  readonly log: ReadonlyArray<StoredChatEntry<BrainstormEntry>>;
  readonly reads: ReadonlyArray<IssueRead>;
  readonly runtime: Option.Option<RuntimeState>;
}

/** Where the one brainstorm chat is kept between server restarts (spec 013, requirement 5). */
export class BrainstormStoreOutbound extends Context.Service<
  BrainstormStoreOutbound,
  {
    /** The stored chat; none when nothing was stored yet or the stored chat cannot be read. */
    readonly load: Effect.Effect<Option.Option<StoredChat>>;
    /** Replaces the stored chat; a failure is logged and the chat goes on in memory. */
    readonly save: (chat: StoredChat) => Effect.Effect<void>;
  }
>()('comms/application/BrainstormStoreOutbound') {}
