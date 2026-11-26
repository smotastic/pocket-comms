import type { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { CreateTaskInput, PlanetDto, TaskCreatedDto } from '../dto/task.dto.js';
import type {
  BranchExistsError,
  MultiplexerRejectedError,
  MultiplexerUnavailableError,
  RepositoryGitError,
} from '../errors.js';
import { makeCreateTask } from '../use-cases/create-task.use-case.js';
import { makePlanets } from '../use-cases/planets.use-case.js';

// The inbound port of the tasks resource (ADR 0006): a new task is a new Herdr worktree with an
// optional agent in it (spec 005). Its methods differ from `AgentsInbound`, which reads and drives
// the agents that already run.

export class TasksInbound extends Context.Service<
  TasksInbound,
  {
    readonly planets: Effect.Effect<ReadonlyArray<PlanetDto>, MultiplexerUnavailableError>;
    readonly create: (
      input: CreateTaskInput,
    ) => Effect.Effect<
      TaskCreatedDto,
      | InvalidInputError
      | RepositoryGitError
      | BranchExistsError
      | MultiplexerUnavailableError
      | MultiplexerRejectedError
    >;
  }
>()('comms/application/TasksInbound') {
  static readonly layer = Layer.effect(
    TasksInbound,
    Effect.gen(function* () {
      return { ...(yield* makePlanets), ...(yield* makeCreateTask) };
    }),
  );
}
