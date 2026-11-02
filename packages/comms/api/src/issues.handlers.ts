import { IssuesInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

/** Implements the `issues` group; the wire shapes equal the application DTOs. */
export const issuesHandlers = HttpApiBuilder.group(
  CommsApi,
  'issues',
  Effect.fn(function* (handlers) {
    const issuesInbound = yield* IssuesInbound;

    return handlers
      .handle('list', ({ params }) =>
        issuesInbound.issues(params.project).pipe(
          Effect.catchTags({
            ProjectNotFoundError: problems.projectNotFound,
            GiteaUnavailableError: problems.giteaUnavailable,
          }),
        ),
      )
      .handle('implement', ({ params, payload }) =>
        issuesInbound
          .implement({
            project: params.project,
            number: Number(params.number),
            branch: payload.branch,
          })
          .pipe(
            Effect.catchTags({
              ProjectNotFoundError: problems.projectNotFound,
              NoGiteaRemoteError: problems.noGiteaRemote,
              GiteaNotConfiguredError: problems.giteaNotConfigured,
              GiteaUnavailableError: problems.giteaUnavailable,
              IssueNotFoundError: problems.issueNotFound,
              IssueClosedError: problems.issueClosed,
              InvalidInputError: problems.invalidInput,
              BranchExistsError: problems.branchExists,
              ProjectGitError: problems.projectGitFailed,
              HerdrUnavailableError: problems.herdrUnavailable,
              HerdrRejectedError: problems.worktreeRefused,
            }),
          ),
      )
      .handle('close', ({ params }) =>
        issuesInbound.close({ project: params.project, number: Number(params.number) }).pipe(
          Effect.catchTags({
            ProjectNotFoundError: problems.projectNotFound,
            NoGiteaRemoteError: problems.noGiteaRemote,
            GiteaNotConfiguredError: problems.giteaNotConfigured,
            GiteaUnavailableError: problems.giteaUnavailable,
            IssueNotFoundError: problems.issueNotFound,
          }),
        ),
      );
  }),
);
