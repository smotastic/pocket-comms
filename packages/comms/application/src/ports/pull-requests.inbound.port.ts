import type {
  InvalidInputError,
  PullRequestListFullError,
  PullRequestRef,
} from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type {
  AttachedPullRequestDto,
  AttachPullRequestInput,
  PullRequestChangesDto,
} from '../dto/pull-request.dto.js';
import type {
  AgentNotFoundError,
  GiteaNotConfiguredError,
  GiteaUnavailableError,
  HerdrUnavailableError,
  InvalidPullRequestError,
  NoConversationError,
  PullRequestNotFoundError,
  PullRequestsStoreError,
} from '../errors.js';
import { makePullRequests } from '../use-cases/pull-requests.use-case.js';

// The inbound port of an agent's attached pull requests (spec 031). `ref` is an agent's name, or
// its pane id; the list belongs to the agent's conversation, by its session id.

type Lookup = AgentNotFoundError | HerdrUnavailableError;
type Gitea = GiteaNotConfiguredError | GiteaUnavailableError;

export class PullRequestsInbound extends Context.Service<
  PullRequestsInbound,
  {
    /** Attaches the pull request; attaching one the agent has changes nothing. */
    readonly attach: (
      ref: string,
      input: AttachPullRequestInput,
    ) => Effect.Effect<
      AttachedPullRequestDto,
      | Lookup
      | Gitea
      | NoConversationError
      | InvalidPullRequestError
      | InvalidInputError
      | PullRequestNotFoundError
      | PullRequestListFullError
      | PullRequestsStoreError
    >;
    /** The agent's attached pull requests in their order, each with its title and state now. */
    readonly list: (
      ref: string,
    ) => Effect.Effect<ReadonlyArray<AttachedPullRequestDto>, Lookup | PullRequestsStoreError>;
    /** Removes the pull request from the agent's list; one that is not there changes nothing. */
    readonly remove: (
      ref: string,
      pullRequest: PullRequestRef,
    ) => Effect.Effect<void, Lookup | PullRequestsStoreError>;
    /** The changed files of an attached pull request, read from Gitea now. */
    readonly changes: (
      ref: string,
      pullRequest: PullRequestRef,
    ) => Effect.Effect<
      PullRequestChangesDto,
      Lookup | Gitea | PullRequestNotFoundError | PullRequestsStoreError
    >;
  }
>()('comms/application/PullRequestsInbound') {
  static readonly layer = Layer.effect(PullRequestsInbound, makePullRequests);
}
