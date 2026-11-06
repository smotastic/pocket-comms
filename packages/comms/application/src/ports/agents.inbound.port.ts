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
  TranscriptDto,
} from '../dto/agent.dto.js';
import type {
  AgentNotFoundError,
  HerdrRejectedError,
  HerdrUnavailableError,
  NotAWorktreeError,
  ProjectGitError,
  SubagentNotFoundError,
  TranscriptUnavailableError,
  WorktreeHasChangesError,
} from '../errors.js';
import { makeAgent } from '../use-cases/agent.use-case.js';
import { makeClose } from '../use-cases/close.use-case.js';
import { makeInput } from '../use-cases/input.use-case.js';
import { makeOverview } from '../use-cases/overview.use-case.js';
import { makeTranscript } from '../use-cases/transcript.use-case.js';

// The one inbound port of the agents resource (ADR 0006). Each method is one use case, and the
// `layer` joins the use cases of `use-cases/`. `ref` is an agent's name, or its pane id.

type Lookup = AgentNotFoundError | HerdrUnavailableError;

export class AgentsInbound extends Context.Service<
  AgentsInbound,
  {
    readonly overview: Effect.Effect<OverviewDto, HerdrUnavailableError>;
    /** The overview now and after every change; it reports Herdr's absence instead of failing. */
    readonly overviewChanges: Stream.Stream<OverviewStateDto>;
    readonly agent: (ref: string) => Effect.Effect<AgentDto, Lookup>;
    readonly markSeen: (ref: string) => Effect.Effect<void, Lookup>;
    readonly transcript: (
      ref: string,
    ) => Effect.Effect<TranscriptDto, Lookup | TranscriptUnavailableError>;
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
    readonly screen: (ref: string) => Effect.Effect<string, Lookup | HerdrRejectedError>;
    /** Sends the text and the paths of the attached images; the text may be blank with images. */
    readonly prompt: (
      ref: string,
      text: string,
      imageIds?: ReadonlyArray<string>,
    ) => Effect.Effect<void, Lookup | InvalidInputError | HerdrRejectedError>;
    /** Types the text into the agent's waiting dialog without submitting it (spec 024). */
    readonly type: (
      ref: string,
      text: string,
    ) => Effect.Effect<void, Lookup | InvalidInputError | HerdrRejectedError>;
    readonly sendKeys: (
      ref: string,
      keys: ReadonlyArray<string>,
    ) => Effect.Effect<void, Lookup | InvalidInputError | HerdrRejectedError>;
    /** Removes the agent's worktree and closes its workspace; `force` drops its changes. */
    readonly close: (
      ref: string,
      force: boolean,
    ) => Effect.Effect<
      void,
      Lookup | NotAWorktreeError | WorktreeHasChangesError | ProjectGitError | HerdrRejectedError
    >;
  }
>()('comms/application/AgentsInbound') {
  static readonly layer = Layer.effect(
    AgentsInbound,
    Effect.gen(function* () {
      return {
        ...(yield* makeOverview),
        ...(yield* makeAgent),
        ...(yield* makeTranscript),
        ...(yield* makeInput),
        ...(yield* makeClose),
      };
    }),
  );
}
