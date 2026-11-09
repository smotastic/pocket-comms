import type { BrainstormEvent, ProposalDecisionRequest } from '@pocket-comms/comms-contract';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import type * as Effect from 'effect/Effect';
import type * as Stream from 'effect/Stream';

export type BrainstormEventView = typeof BrainstormEvent.Type;
export type Decision = typeof ProposalDecisionRequest.Type;

/** comms cannot be reached: no connection, or it does not answer. */
export class Unreachable extends Data.TaggedError('Unreachable')<{ readonly reason: string }> {}

/** Pi is still answering, so the chat takes no message now. */
export class Busy extends Data.TaggedError('Busy') {}

/** The brainstorm chat or the transcription is not set up on the server. */
export class NotSetUp extends Data.TaggedError('NotSetUp')<{ readonly reason: string }> {}

/** comms refused the request itself, such as a clip that is not audio; trying again is no use. */
export class Refused extends Data.TaggedError('Refused')<{ readonly reason: string }> {}

/** Any other failure, such as the speech service being down; worth trying again. */
export class Failed extends Data.TaggedError('Failed')<{ readonly reason: string }> {}

export type CommsError = Unreachable | Busy | NotSetUp | Refused | Failed;

/** The brainstorm chat of comms and its transcription, as the buddy uses them. */
export class Comms extends Context.Service<
  Comms,
  {
    readonly transcribe: (clip: Uint8Array) => Effect.Effect<string, CommsError>;
    readonly send: (text: string) => Effect.Effect<void, CommsError>;
    /** Whether Pi is answering right now. */
    readonly answering: Effect.Effect<boolean, CommsError>;
    /** The chat's events after the entry numbered `after`, then live ones. */
    readonly events: (after: number) => Stream.Stream<BrainstormEventView, CommsError>;
    readonly decide: (proposal: string, decision: Decision) => Effect.Effect<void, CommsError>;
  }
>()('buddy/Comms') {}
