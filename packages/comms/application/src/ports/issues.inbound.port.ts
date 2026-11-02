import type { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { CloseIssueInput, ImplementIssueInput, IssueListDto } from '../dto/issue.dto.js';
import type { TaskCreatedDto } from '../dto/task.dto.js';
import type {
  BranchExistsError,
  GiteaNotConfiguredError,
  GiteaUnavailableError,
  HerdrRejectedError,
  HerdrUnavailableError,
  IssueClosedError,
  IssueNotFoundError,
  NoGiteaRemoteError,
  ProjectGitError,
  ProjectNotFoundError,
} from '../errors.js';
import { makeCloseIssue } from '../use-cases/close-issue.use-case.js';
import { makeImplementIssue } from '../use-cases/implement-issue.use-case.js';
import { makeIssues } from '../use-cases/issues.use-case.js';

// The inbound port of the issues resource (ADR 0006): a project's open Gitea issues, and
// implementing one as a spec 005 task (spec 006), and closing one (spec 010).

export class IssuesInbound extends Context.Service<
  IssuesInbound,
  {
    readonly issues: (
      project: string,
    ) => Effect.Effect<IssueListDto, ProjectNotFoundError | GiteaUnavailableError>;
    readonly implement: (
      input: ImplementIssueInput,
    ) => Effect.Effect<
      TaskCreatedDto,
      | ProjectNotFoundError
      | NoGiteaRemoteError
      | GiteaNotConfiguredError
      | GiteaUnavailableError
      | IssueNotFoundError
      | IssueClosedError
      | InvalidInputError
      | ProjectGitError
      | BranchExistsError
      | HerdrUnavailableError
      | HerdrRejectedError
    >;
    readonly close: (
      input: CloseIssueInput,
    ) => Effect.Effect<
      void,
      | ProjectNotFoundError
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
