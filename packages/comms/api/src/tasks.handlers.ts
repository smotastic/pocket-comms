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
      .handle('projects', () =>
        tasksInbound.projects.pipe(
          Effect.map((projects) => ({ projects })),
          Effect.catchTags({ HerdrUnavailableError: problems.herdrUnavailable }),
        ),
      )
      .handle('create', ({ payload }) =>
        tasksInbound
          .create({
            project: payload.project,
            task: payload.task,
            branch: payload.branch,
            agent: payload.agent?.kind,
          })
          .pipe(
            Effect.catchTags({
              InvalidInputError: problems.invalidInput,
              BranchExistsError: problems.branchExists,
              ProjectGitError: problems.projectGitFailed,
              HerdrUnavailableError: problems.herdrUnavailable,
              HerdrRejectedError: problems.worktreeRefused,
            }),
          ),
      );
  }),
);
