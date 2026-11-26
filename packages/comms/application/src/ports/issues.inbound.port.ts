import type { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type {
  CloseIssueInput,
  ImplementIssueInput,
  IssueListDto,
  IssueTaskCreatedDto,
} from '../dto/issue.dto.js';
import type {
  BranchExistsError,
  GiteaNotConfiguredError,
  GiteaUnavailableError,
  MultiplexerRejectedError,
  MultiplexerUnavailableError,
  IssueClosedError,
  IssueNotFoundError,
  NoGiteaRemoteError,
  RepositoryGitError,
  PlanetNotFoundError,
} from '../errors.js';
import { makeCloseIssue } from '../use-cases/close-issue.use-case.js';
import { makeImplementIssue } from '../use-cases/implement-issue.use-case.js';
import { makeIssues } from '../use-cases/issues.use-case.js';

// The inbound port of the issues resource (ADR 0006): a planet's open Gitea issues, and
// implementing one as a spec 005 task and marking it in progress (specs 006 and 015), and closing
// one (spec 010).

export class IssuesInbound extends Context.Service<
  IssuesInbound,
  {
    readonly issues: (
      planet: string,
    ) => Effect.Effect<IssueListDto, PlanetNotFoundError | GiteaUnavailableError>;
    readonly implement: (
      input: ImplementIssueInput,
    ) => Effect.Effect<
      IssueTaskCreatedDto,
      | PlanetNotFoundError
      | NoGiteaRemoteError
      | GiteaNotConfiguredError
      | GiteaUnavailableError
      | IssueNotFoundError
      | IssueClosedError
      | InvalidInputError
      | RepositoryGitError
      | BranchExistsError
      | MultiplexerUnavailableError
      | MultiplexerRejectedError
    >;
    readonly close: (
      input: CloseIssueInput,
    ) => Effect.Effect<
      void,
      | PlanetNotFoundError
      | NoGiteaRemoteError
      | GiteaNotConfiguredError
      | GiteaUnavailableError
      | IssueNotFoundError
    >;
  }
>()('comms/application/IssuesInbound') {
  static readonly layer = Layer.effect(
    IssuesInbound,
    Effect.gen(function* () {
      return {
        ...(yield* makeIssues),
        ...(yield* makeImplementIssue),
        ...(yield* makeCloseIssue),
      };
    }),
  );
}
