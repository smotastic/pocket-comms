import type { TranscriptEntry, TranscriptFormat } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type * as Stream from 'effect/Stream';
import type { TranscriptUnavailableError } from '../errors.js';

/** Where an agent's session file is: its format, its session id and the agent's directory. */
export interface TranscriptSource {
  readonly ref: string;
  readonly format: TranscriptFormat;
  readonly session: string;
  readonly cwd: string | undefined;
}

export interface Transcript {
  /** The latest entries, oldest first. */
  readonly entries: ReadonlyArray<TranscriptEntry>;
  /** When the session file last changed, in epoch milliseconds. */
  readonly modifiedAt: number;
}

/** The session files of Claude and Pi agents. */
export class TranscriptOutbound extends Context.Service<
  TranscriptOutbound,
  {
    readonly read: (
      source: TranscriptSource,
    ) => Effect.Effect<Transcript, TranscriptUnavailableError>;
    /**
     * Emits the latest entries at once, then the entries that are new or changed, such as a tool
     * call whose outcome arrived. A changed entry keeps its id. A read that fails is retried at
     * the next check, so a passing error never ends the stream.
     */
    readonly follow: (
      source: TranscriptSource,
    ) => Stream.Stream<ReadonlyArray<TranscriptEntry>, TranscriptUnavailableError>;
    /** When the session file last changed, or none when there is no such file. */
    readonly modifiedAt: (source: TranscriptSource) => Effect.Effect<Option.Option<number>>;
  }
>()('comms/application/TranscriptOutbound') {}
