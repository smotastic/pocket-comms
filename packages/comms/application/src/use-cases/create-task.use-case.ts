import {
  agentNameFor,
  InvalidInputError,
  parseAgentToStart,
  parseBranch,
  parseTask,
  promptWithImages,
  type AgentToStart,
  type Project,
} from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import type { CreateTaskInput, TaskAgentDto, TaskCreatedDto } from '../dto/task.dto.js';
import {
  BranchExistsError,
  type HerdrRejectedError,
  type HerdrUnavailableError,
} from '../errors.js';
import {
  HerdrOutbound,
  type CreatedWorktree,
  type StartedAgent,
} from '../ports/herdr.outbound.port.js';
import { ProjectsOutbound } from '../ports/projects.outbound.port.js';
import { makeImagePaths } from './image-paths.js';

// Creates a task (spec 005): checks every input before anything changes, creates the worktree
// through Herdr, then optionally starts an agent and sends it the task. Once the worktree exists
// the request succeeds; what fails after that becomes a note.

const issuesOf = <A>(result: Result.Result<A, InvalidInputError>): InvalidInputError['issues'] =>
  Result.isFailure(result) ? result.failure.issues : [];

const messageOf = (error: HerdrUnavailableError | HerdrRejectedError): string =>
  error._tag === 'HerdrRejectedError' ? error.message : error.reason;

// Herdr may report a just-started agent before it has detected its status. The use case asks
// again this often, this many times, before it gives up on sending the task.
const SETTLE_PAUSE = '500 millis';
const SETTLE_TRIES = 20;

const NOTES = {
  blocked:
    'The agent waits for an answer, so the task was not sent. Answer it, then send the task.',
  unsettled:
    'The agent did not report itself ready in time, so the task was not sent. Send it from the conversation.',
} as const;

export const makeCreateTask = Effect.gen(function* () {
  const projectsOutbound = yield* ProjectsOutbound;
  const herdrOutbound = yield* HerdrOutbound;
  const { imagePaths } = yield* makeImagePaths;

  const findProject = Effect.fnUntraced(function* (name: string) {
    const projects = yield* projectsOutbound.list;
    const project = projects.find((candidate) => candidate.name === name);
    if (project === undefined) {
      return yield* new InvalidInputError({
        issues: [{ field: 'project', message: `${name} is not a project the app offers.` }],
      });
    }
    return project;
  });

  const checkBranch = Effect.fnUntraced(function* (project: Project, branch: string) {
    if (!(yield* projectsOutbound.isValidBranchName(project, branch))) {
      return yield* new InvalidInputError({
        issues: [{ field: 'branch', message: `git does not accept ${branch} as a branch name.` }],
      });
    }
    const base = yield* projectsOutbound.defaultBase(project);
    if (yield* projectsOutbound.branchExists(project, branch)) {
      return yield* new BranchExistsError({ branch });
    }
    return base;
  });

  // The status that decides whether the task is sent: `idle`, `blocked`, or `unsettled` when
  // Herdr reports neither within the settle time.
  const settledStatus = Effect.fnUntraced(function* (paneId: string, started: StartedAgent) {
    if (started.status === 'blocked') return 'blocked' as const;
    if (started.status === 'idle' && started.ready) return 'idle' as const;
    for (let attempt = 0; attempt < SETTLE_TRIES; attempt += 1) {
      yield* Effect.sleep(SETTLE_PAUSE);
      const snapshot = yield* herdrOutbound.snapshot.pipe(Effect.option);
      const status = Option.isSome(snapshot)
        ? snapshot.value.agents.find((agent) => agent.paneId === paneId)?.status
        : undefined;
      if (status === 'idle' || status === 'blocked') return status;
    }
    return 'unsettled' as const;
  });

  // Starts the agent, and sends the task only to an agent that is idle: any other agent may show
  // a dialog, and the app never answers one for the owner.
  const startAgent = Effect.fnUntraced(function* (
    worktree: CreatedWorktree,
    kind: AgentToStart,
    text: string,
  ) {
    const snapshot = yield* herdrOutbound.snapshot.pipe(Effect.option);
    const taken = new Set(
      snapshot._tag === 'Some'
        ? snapshot.value.agents.flatMap((agent) => (agent.name === undefined ? [] : [agent.name]))
        : [],
    );
    const ref = agentNameFor(worktree.branch, taken);
    const notStarted = (note: string): TaskAgentDto => ({
      ref,
      started: false,
      prompted: false,
      note,
    });
    const started = yield* herdrOutbound
      .startAgent({ paneId: worktree.paneId, name: ref, kind })
      .pipe(Effect.result);
    if (Result.isFailure(started)) {
      return notStarted(`The agent did not start: ${messageOf(started.failure)}`);
    }
    yield* Effect.logInfo('Agent started').pipe(
      Effect.annotateLogs({
        agent: ref,
        status: started.success.status,
        ready: started.success.ready,
      }),
    );
    const status = yield* settledStatus(worktree.paneId, started.success);
    if (status !== 'idle') {
      return { ref, started: true, prompted: false, note: NOTES[status] } satisfies TaskAgentDto;
    }
    const prompted = yield* herdrOutbound.prompt(worktree.paneId, text).pipe(Effect.result);
    return Result.isFailure(prompted)
      ? ({
          ref,
          started: true,
          prompted: false,
          note: `The task was not sent: ${messageOf(prompted.failure)}`,
        } satisfies TaskAgentDto)
      : ({ ref, started: true, prompted: true, note: undefined } satisfies TaskAgentDto);
  });

  const create = Effect.fn('Tasks.create')(function* (input: CreateTaskInput) {
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

    const project = yield* findProject(input.project);
    const base = yield* checkBranch(project, branch.success);
    const worktree = yield* herdrOutbound.createWorktree({
      cwd: project.path,
      branch: branch.success,
      base,
      label: task.success.title,
    });
    const agent =
      kind.success === undefined
        ? undefined
        : yield* startAgent(worktree, kind.success, promptWithImages(task.success.text, paths));
    return {
      workspace: worktree.workspaceId,
      branch: worktree.branch,
      path: worktree.path,
      agent,
    } satisfies TaskCreatedDto;
  });

  return { create };
});
