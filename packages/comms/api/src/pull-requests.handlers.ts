import { PullRequestsInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

const lookup = {
  AgentNotFoundError: problems.agentNotFound,
  MultiplexerUnavailableError: problems.herdrUnavailable,
} as const;

const gitea = {
  GiteaNotConfiguredError: problems.giteaNotConfigured,
  GiteaUnavailableError: problems.giteaUnavailable,
} as const;

const refOf = (params: {
  readonly owner: string;
  readonly repository: string;
  readonly number: string;
}) => ({ owner: params.owner, name: params.repository, number: Number(params.number) });

/** Implements the `pullRequests` group: an agent's attached pull requests (spec 031). */
export const pullRequestsHandlers = HttpApiBuilder.group(
  CommsApi,
  'pullRequests',
  Effect.fn(function* (handlers) {
    const pullRequestsInbound = yield* PullRequestsInbound;

    return handlers
      .handle('attach', ({ params, payload }) =>
        pullRequestsInbound.attach(params.agent, payload).pipe(
          Effect.catchTags({
            ...lookup,
            ...gitea,
            NoConversationError: problems.noConversation,
            InvalidPullRequestError: problems.invalidPullRequest,
            InvalidInputError: problems.invalidInput,
            PullRequestNotFoundError: problems.pullRequestNotFound,
            PullRequestListFullError: problems.pullRequestListFull,
            PullRequestsStoreError: problems.pullRequestsUnavailable,
          }),
        ),
      )
      .handle('list', ({ params }) =>
        pullRequestsInbound.list(params.agent).pipe(
          Effect.map((pullRequests) => ({ pullRequests })),
          Effect.catchTags({
            ...lookup,
            PullRequestsStoreError: problems.pullRequestsUnavailable,
          }),
        ),
      )
      .handle('remove', ({ params }) =>
        pullRequestsInbound.remove(params.agent, refOf(params)).pipe(
          Effect.catchTags({
            ...lookup,
            PullRequestsStoreError: problems.pullRequestsUnavailable,
          }),
        ),
      )
      .handle('changes', ({ params }) =>
        pullRequestsInbound.changes(params.agent, refOf(params)).pipe(
          Effect.catchTags({
            ...lookup,
            ...gitea,
            PullRequestNotFoundError: problems.pullRequestNotFound,
            PullRequestsStoreError: problems.pullRequestsUnavailable,
          }),
        ),
      );
  }),
);
