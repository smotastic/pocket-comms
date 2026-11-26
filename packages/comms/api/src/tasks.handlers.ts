import { TasksInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

/** Implements the `tasks` group; the wire shapes equal the application DTOs. */
export const tasksHandlers = HttpApiBuilder.group(
  CommsApi,
  'tasks',
  Effect.fn(function* (handlers) {
    const tasksInbound = yield* TasksInbound;

    return handlers
      .handle('planets', () =>
        tasksInbound.planets.pipe(
          Effect.map((planets) => ({ planets })),
          Effect.catchTags({ MultiplexerUnavailableError: problems.herdrUnavailable }),
        ),
      )
      .handle('create', ({ payload }) =>
        tasksInbound
          .create({
            planet: payload.planet,
            task: payload.task,
            branch: payload.branch,
            agent: payload.agent?.kind,
            imageIds: payload.imageIds,
          })
          .pipe(
            Effect.catchTags({
              InvalidInputError: problems.invalidInput,
              BranchExistsError: problems.branchExists,
              RepositoryGitError: problems.planetGitFailed,
              MultiplexerUnavailableError: problems.herdrUnavailable,
              MultiplexerRejectedError: problems.worktreeRefused,
            }),
          ),
      );
  }),
);
