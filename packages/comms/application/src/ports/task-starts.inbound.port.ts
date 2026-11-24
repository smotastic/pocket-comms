import type { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { TaskCreatedDto } from '../dto/task.dto.js';
import type {
  SendTaskStartInput,
  StartAgentInWorktreeInput,
  TaskStartDto,
  TaskStartSentDto,
} from '../dto/task-start.dto.js';
import type {
  AgentNotFoundError,
  AgentNotReadyError,
  DeliveryUncertainError,
  GiteaNotConfiguredError,
  GiteaUnavailableError,
  HerdrRejectedError,
  HerdrUnavailableError,
  IssueClosedError,
  IssueNotFoundError,
  NoGiteaRemoteError,
  NoTaskStartError,
  ProjectGitError,
  ProjectNotFoundError,
  TaskStartsStoreError,
  WorktreeBusyError,
  WorktreeNotFoundError,
} from '../errors.js';
import { makeTaskStarts, settleTaskStartsAfterRestart } from '../use-cases/task-starts.use-case.js';

// The inbound port of task starts (spec 032): the start of an agent's worktree whose first prompt
// was not delivered, sending or dismissing it, and starting an agent in an issue's existing
// worktree. `ref` is an agent's name, or its pane id.

type Lookup = AgentNotFoundError | HerdrUnavailableError | TaskStartsStoreError;

export class TaskStartsInbound extends Context.Service<
  TaskStartsInbound,
  {
    /** The start of the agent's worktree, or with `fromIssue` its issue's task; none when done. */
    readonly forAgent: (
      ref: string,
      fromIssue: boolean,
    ) => Effect.Effect<TaskStartDto | undefined, Lookup | ProjectNotFoundError>;
    /** Sends the prompt to the agent while it is idle and ready, and keeps where it went. */
    readonly send: (
      ref: string,
      input: SendTaskStartInput,
    ) => Effect.Effect<
      TaskStartSentDto,
      | Lookup
      | ProjectNotFoundError
      | InvalidInputError
      | NoTaskStartError
      | AgentNotReadyError
      | DeliveryUncertainError
    >;
    /** Forgets the start of the agent's worktree without sending anything. */
    readonly dismiss: (ref: string) => Effect.Effect<void, Lookup | ProjectNotFoundError>;
    /** Starts an agent in the issue's existing worktree on `branch`, with the start's prompt. */
    readonly startInWorktree: (
      input: StartAgentInWorktreeInput,
    ) => Effect.Effect<
      TaskCreatedDto,
      | HerdrUnavailableError
      | HerdrRejectedError
      | TaskStartsStoreError
      | ProjectNotFoundError
      | ProjectGitError
      | NoGiteaRemoteError
      | GiteaNotConfiguredError
      | GiteaUnavailableError
      | IssueNotFoundError
      | IssueClosedError
      | WorktreeNotFoundError
      | WorktreeBusyError
    >;
  }
>()('comms/application/TaskStartsInbound') {
  /** Built once at server start, so a start that was pending then reads as uncertain. */
  static readonly layer = Layer.effect(
    TaskStartsInbound,
    Effect.andThen(settleTaskStartsAfterRestart, makeTaskStarts),
  );
}
