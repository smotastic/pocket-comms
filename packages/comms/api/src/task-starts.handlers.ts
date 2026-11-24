import { TaskStartsInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

const lookup = {
  AgentNotFoundError: problems.agentNotFound,
  HerdrUnavailableError: problems.herdrUnavailable,
  ProjectNotFoundError: problems.projectNotFound,
  TaskStartsStoreError: problems.taskStartsUnavailable,
} as const;

/** Implements the `taskStarts` group: recovering a task start (spec 032). */
export const taskStartsHandlers = HttpApiBuilder.group(
  CommsApi,
  'taskStarts',
  Effect.fn(function* (handlers) {
    const taskStartsInbound = yield* TaskStartsInbound;

    return handlers
      .handle('read', ({ params, query }) =>
        taskStartsInbound.forAgent(params.agent, query.fromIssue === 'true').pipe(
          Effect.map((start) => ({ start })),
          Effect.catchTags(lookup),
        ),
      )
      .handle('send', ({ params, payload }) =>
        taskStartsInbound.send(params.agent, payload).pipe(
          Effect.catchTags({
            ...lookup,
            InvalidInputError: problems.invalidInput,
            NoTaskStartError: problems.noTaskStart,
            AgentNotReadyError: problems.agentNotReady,
            DeliveryUncertainError: problems.deliveryUncertain,
          }),
        ),
      )
      .handle('dismiss', ({ params }) =>
        taskStartsInbound.dismiss(params.agent).pipe(Effect.catchTags(lookup)),
      )
      .handle('startAgent', ({ params, payload }) =>
        taskStartsInbound
          .startInWorktree({
            project: params.project,
            number: Number(params.number),
            branch: payload.branch,
            agent: payload.agent,
          })
          .pipe(
            Effect.catchTags({
              ProjectNotFoundError: problems.projectNotFound,
              ProjectGitError: problems.projectGitFailed,
              NoGiteaRemoteError: problems.noGiteaRemote,
              GiteaNotConfiguredError: problems.giteaNotConfigured,
              GiteaUnavailableError: problems.giteaUnavailable,
              IssueNotFoundError: problems.issueNotFound,
              IssueClosedError: problems.issueClosed,
              WorktreeNotFoundError: problems.worktreeNotFound,
              WorktreeBusyError: problems.worktreeBusy,
              TaskStartsStoreError: problems.taskStartsUnavailable,
              HerdrUnavailableError: problems.herdrUnavailable,
              HerdrRejectedError: problems.worktreeRefused,
            }),
          ),
      );
  }),
);
