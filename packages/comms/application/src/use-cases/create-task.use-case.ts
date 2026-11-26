import {
  InvalidInputError,
  parseAgentToStart,
  parseBranch,
  parseTask,
  promptWithImages,
  type Repository,
} from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Result from 'effect/Result';
import type { CreateTaskInput, TaskCreatedDto } from '../dto/task.dto.js';
import { BranchExistsError } from '../errors.js';
import { MultiplexerOutbound } from '../ports/multiplexer.outbound.port.js';
import { RepositoriesOutbound } from '../ports/repositories.outbound.port.js';
import { makeAgentLaunch } from './agent-launch.js';
import { makeImagePaths } from './image-paths.js';
import { makePlanetRegistry } from './planet-registry.js';

// Creates a task (spec 005): checks every input before anything changes, creates the worktree
// through Herdr, then optionally starts an agent and sends it the task. Once the worktree exists
// the request succeeds; what fails after that becomes a note, and the task start is kept.

const issuesOf = <A>(result: Result.Result<A, InvalidInputError>): InvalidInputError['issues'] =>
  Result.isFailure(result) ? result.failure.issues : [];

export const makeCreateTask = Effect.gen(function* () {
  const planetsOutbound = yield* RepositoriesOutbound;
  const herdrOutbound = yield* MultiplexerOutbound;
  const { imagePaths } = yield* makeImagePaths;
  const { launch } = yield* makeAgentLaunch;
  const { planets } = yield* makePlanetRegistry;

  const findPlanet = Effect.fnUntraced(function* (name: string) {
    const planet = (yield* planets).find((candidate) => candidate.name === name);
    if (planet === undefined) {
      return yield* new InvalidInputError({
        issues: [{ field: 'planet', message: `${name} is not a planet the app offers.` }],
      });
    }
    return planet;
  });

  const checkBranch = Effect.fnUntraced(function* (planet: Repository, branch: string) {
    if (!(yield* planetsOutbound.isValidBranchName(planet, branch))) {
      return yield* new InvalidInputError({
        issues: [{ field: 'branch', message: `git does not accept ${branch} as a branch name.` }],
      });
    }
    const base = yield* planetsOutbound.defaultBase(planet);
    if (yield* planetsOutbound.branchExists(planet, branch)) {
      return yield* new BranchExistsError({ branch });
    }
    return base;
  });

  /** Creates the task; `issue` is the issue it implements, kept with its start. */
  const create = Effect.fn('Tasks.create')(function* (input: CreateTaskInput, issue?: number) {
    const task = parseTask(input.task);
    const branch = parseBranch(input.branch);
    const kind =
      input.agent === undefined ? Result.succeed(undefined) : parseAgentToStart(input.agent);
    if (Result.isFailure(task) || Result.isFailure(branch) || Result.isFailure(kind)) {
      return yield* new InvalidInputError({
        issues: [...issuesOf(task), ...issuesOf(branch), ...issuesOf(kind)],
      });
    }

    const imageIds = input.imageIds ?? [];
    if (imageIds.length > 0 && kind.success === undefined) {
      return yield* new InvalidInputError({
        issues: [{ field: 'imageIds', message: 'Images need an agent to start.' }],
      });
    }
    const paths = yield* imagePaths(imageIds);

    const planet = yield* findPlanet(input.planet);
    const base = yield* checkBranch(planet, branch.success);
    // git adds the worktree, then the multiplexer opens it as a workspace (ADR 0015).
    const added = yield* planetsOutbound.addWorktree(planet, { branch: branch.success, base });
    const opened = yield* herdrOutbound.openWorktree({
      cwd: planet.path,
      path: added.path,
      label: task.success.title,
    });
    const worktree = { ...added, ...opened };
    const agent =
      kind.success === undefined
        ? undefined
        : yield* launch(
            { folder: worktree.path, planet: planet.name, branch: worktree.branch, issue },
            worktree.paneId,
            kind.success,
            promptWithImages(task.success.text, paths),
          );
    return {
      workspace: worktree.workspaceId,
      branch: worktree.branch,
      path: worktree.path,
      agent,
    } satisfies TaskCreatedDto;
  });

  return { create };
});
