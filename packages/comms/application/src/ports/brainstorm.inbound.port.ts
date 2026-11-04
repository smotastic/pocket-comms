import type { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type * as Stream from 'effect/Stream';
import type {
  BrainstormEventDto,
  BrainstormStateDto,
  ProposalDecisionInput,
} from '../dto/brainstorm.dto.js';
import type {
  BrainstormBusyError,
  BrainstormNotSetUpError,
  GiteaNotConfiguredError,
  GiteaUnavailableError,
  IssueChangedError,
  IssueNotFoundError,
  NoGiteaRemoteError,
  ProposalDecidedError,
  ProposalNotFoundError,
} from '../errors.js';
import { makeBrainstorm } from '../use-cases/brainstorm.use-case.js';

// The inbound port of the brainstorm resource (ADR 0006, spec 013). The server holds one for its
// lifetime: Pi's turns run in the layer's scope.

export class BrainstormInbound extends Context.Service<
  BrainstormInbound,
  {
    readonly state: Effect.Effect<BrainstormStateDto>;
    /** The state at once, then every change and the text Pi writes. */
    readonly events: Stream.Stream<BrainstormEventDto>;
    /** Adds the owner's message and starts Pi's answer, without waiting for it. */
    readonly send: (
      text: string,
    ) => Effect.Effect<void, BrainstormNotSetUpError | BrainstormBusyError | InvalidInputError>;
    /**
     * Creates the issue of an open proposal, applies an open edit while the issue's title and body
     * are unchanged since Pi read them, or discards either; then tells Pi in a new turn.
     */
    readonly decide: (
      id: string,
      decision: ProposalDecisionInput,
    ) => Effect.Effect<
      void,
      | BrainstormNotSetUpError
      | BrainstormBusyError
      | ProposalNotFoundError
      | ProposalDecidedError
      | InvalidInputError
      | NoGiteaRemoteError
      | GiteaNotConfiguredError
      | GiteaUnavailableError
      | IssueNotFoundError
      | IssueChangedError
    >;
    /** Stops a running answer and starts an empty chat. */
    readonly reset: () => Effect.Effect<void>;
  }
>()('comms/application/BrainstormInbound') {
  static readonly layer = Layer.effect(BrainstormInbound, makeBrainstorm);
}
