import { IssuesInbound, MissionsInbound } from '@pocket-comms/comms-application';
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
    const missionsInbound = yield* MissionsInbound;

    return handlers
      .handle('list', ({ params }) =>
        issuesInbound.issues(params.planet).pipe(
          Effect.catchTags({
            PlanetNotFoundError: problems.planetNotFound,
            GiteaUnavailableError: problems.giteaUnavailable,
          }),
        ),
      )
      .handle('implement', ({ params, payload }) =>
        issuesInbound
          .implement({
            planet: params.planet,
            number: Number(params.number),
            branch: payload.branch,
            additionalInformation: payload.additionalInformation,
          })
          .pipe(
            Effect.catchTags({
              PlanetNotFoundError: problems.planetNotFound,
              NoGiteaRemoteError: problems.noGiteaRemote,
              GiteaNotConfiguredError: problems.giteaNotConfigured,
              GiteaUnavailableError: problems.giteaUnavailable,
              IssueNotFoundError: problems.issueNotFound,
              IssueClosedError: problems.issueClosed,
              InvalidInputError: problems.invalidInput,
              BranchExistsError: problems.branchExists,
              RepositoryGitError: problems.planetGitFailed,
              MultiplexerUnavailableError: problems.herdrUnavailable,
              MultiplexerRejectedError: problems.worktreeRefused,
            }),
          ),
      )
      .handle('sendOnMission', ({ params, payload }) =>
        missionsInbound.send(params.planet, Number(params.number), payload.lane).pipe(
          Effect.catchTags({
            MissionRefusedError: problems.missionRefused,
            PlanetNotFoundError: problems.planetNotFound,
            NoGiteaRemoteError: problems.noGiteaRemote,
            GiteaNotConfiguredError: problems.giteaNotConfigured,
            GiteaUnavailableError: problems.giteaUnavailable,
            IssueNotFoundError: problems.issueNotFound,
            MissionsStoreError: problems.missionsUnavailable,
          }),
        ),
      )
      .handle('close', ({ params }) =>
        issuesInbound.close({ planet: params.planet, number: Number(params.number) }).pipe(
          Effect.catchTags({
            PlanetNotFoundError: problems.planetNotFound,
            NoGiteaRemoteError: problems.noGiteaRemote,
            GiteaNotConfiguredError: problems.giteaNotConfigured,
            GiteaUnavailableError: problems.giteaUnavailable,
            IssueNotFoundError: problems.issueNotFound,
          }),
        ),
      );
  }),
);
