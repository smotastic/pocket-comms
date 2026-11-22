import type {
  BackgroundItem,
  ConversationEntry,
  ConversationFormat,
} from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type * as Stream from 'effect/Stream';
import type { ConversationUnavailableError } from '../errors.js';

/** Where an agent's session file is: its format, its session id and the agent's directory. */
export interface ConversationSource {
  readonly ref: string;
  readonly format: ConversationFormat;
  readonly session: string;
  readonly cwd: string | undefined;
  /** A subagent of the session, by id: its own conversation instead of the session's. */
  readonly subagent?: string | undefined;
}

/** What Claude records about a subagent next to its conversation. */
export interface SubagentMeta {
  readonly description: string;
  readonly agentType: string | undefined;
  readonly inBackground: boolean;
}

export interface Conversation {
  /** The latest entries, oldest first. */
  readonly entries: ReadonlyArray<ConversationEntry>;
  /** When the session file last changed, in epoch milliseconds. */
  readonly modifiedAt: number;
}

/** The session files of Claude and Pi agents. */
export class ConversationOutbound extends Context.Service<
  ConversationOutbound,
  {
    readonly read: (
      source: ConversationSource,
    ) => Effect.Effect<Conversation, ConversationUnavailableError>;
    /**
     * Emits the latest entries at once, then the entries that are new or changed, such as a tool
     * call whose outcome arrived. A changed entry keeps its id. A read that fails is retried at
     * the next check, so a passing error never ends the stream.
     */
    readonly follow: (
      source: ConversationSource,
    ) => Stream.Stream<ReadonlyArray<ConversationEntry>, ConversationUnavailableError>;
    /** When the session file last changed, or none when there is no such file. */
    readonly modifiedAt: (source: ConversationSource) => Effect.Effect<Option.Option<number>>;
    /**
     * The background work of the whole session that has not ended, expired monitors included.
     * Each subagent names its id once the session or its own files know it.
     */
    readonly background: (
      source: ConversationSource,
    ) => Effect.Effect<ReadonlyArray<BackgroundItem>, ConversationUnavailableError>;
    /** What Claude records about the subagent `source` names, or none without such a record. */
    readonly subagentMeta: (
      source: ConversationSource,
    ) => Effect.Effect<Option.Option<SubagentMeta>>;
  }
>()('comms/application/ConversationOutbound') {}
