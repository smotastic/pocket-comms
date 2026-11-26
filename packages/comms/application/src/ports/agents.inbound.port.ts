import type { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type * as Stream from 'effect/Stream';
import type {
  AgentDto,
  AgentEventDto,
  OverviewDto,
  OverviewStateDto,
  SubagentDto,
  SubagentEventDto,
  ConversationDto,
} from '../dto/agent.dto.js';
import type {
  AgentNotFoundError,
  MultiplexerRejectedError,
  MultiplexerUnavailableError,
  NotAWorktreeError,
  RepositoryGitError,
  QuestionNotWaitingError,
  SubagentNotFoundError,
  ConversationUnavailableError,
  WorktreeHasChangesError,
} from '../errors.js';
import { makeAgent } from '../use-cases/agent.use-case.js';
import { makeClose } from '../use-cases/close.use-case.js';
import { makeInput } from '../use-cases/input.use-case.js';
import { makeOverview } from '../use-cases/overview.use-case.js';
import { makeConversation } from '../use-cases/conversation.use-case.js';

// The one inbound port of the agents resource (ADR 0006). Each method is one use case, and the
// `layer` joins the use cases of `use-cases/`. `ref` is an agent's name, or its pane id.

type Lookup = AgentNotFoundError | MultiplexerUnavailableError;

export class AgentsInbound extends Context.Service<
  AgentsInbound,
  {
    readonly overview: Effect.Effect<OverviewDto, MultiplexerUnavailableError>;
    /** The overview now and after every change; it reports Herdr's absence instead of failing. */
    readonly overviewChanges: Stream.Stream<OverviewStateDto>;
    readonly agent: (ref: string) => Effect.Effect<AgentDto, Lookup>;
    readonly markSeen: (ref: string) => Effect.Effect<void, Lookup>;
    readonly conversation: (
      ref: string,
    ) => Effect.Effect<ConversationDto, Lookup | ConversationUnavailableError>;
    readonly agentEvents: (ref: string) => Effect.Effect<Stream.Stream<AgentEventDto>, Lookup>;
    /** A subagent of the agent's session, by id: what it is and its conversation. */
    readonly subagent: (
      ref: string,
      id: string,
    ) => Effect.Effect<SubagentDto, Lookup | SubagentNotFoundError>;
    readonly subagentEvents: (
      ref: string,
      id: string,
    ) => Effect.Effect<Stream.Stream<SubagentEventDto>, Lookup | SubagentNotFoundError>;
    readonly screen: (ref: string) => Effect.Effect<string, Lookup | MultiplexerRejectedError>;
    /** Sends the text and the paths of the attached images; the text may be blank with images. */
    readonly prompt: (
      ref: string,
      text: string,
      imageIds?: ReadonlyArray<string>,
    ) => Effect.Effect<void, Lookup | InvalidInputError | MultiplexerRejectedError>;
    /** Types the text into the agent's waiting dialog without submitting it. */
    readonly type: (
      ref: string,
      text: string,
    ) => Effect.Effect<void, Lookup | InvalidInputError | MultiplexerRejectedError>;
    readonly sendKeys: (
      ref: string,
      keys: ReadonlyArray<string>,
    ) => Effect.Effect<void, Lookup | InvalidInputError | MultiplexerRejectedError>;
    /**
     * Answers the waiting question call `call` with the chosen options' indexes, one list per
     * question, by pressing the dialog's keys.
     */
    readonly answer: (
      ref: string,
      call: string,
      answers: ReadonlyArray<ReadonlyArray<number>>,
    ) => Effect.Effect<
      void,
      Lookup | InvalidInputError | QuestionNotWaitingError | MultiplexerRejectedError
    >;
    /** Removes the agent's worktree and closes its workspace; `force` drops its changes. */
    readonly close: (
      ref: string,
      force: boolean,
    ) => Effect.Effect<
      void,
      | Lookup
      | NotAWorktreeError
      | WorktreeHasChangesError
      | RepositoryGitError
      | MultiplexerRejectedError
    >;
  }
>()('comms/application/AgentsInbound') {
  static readonly layer = Layer.effect(
    AgentsInbound,
    Effect.gen(function* () {
      return {
        ...(yield* makeOverview),
        ...(yield* makeAgent),
        ...(yield* makeConversation),
        ...(yield* makeInput),
        ...(yield* makeClose),
      };
    }),
  );
}
