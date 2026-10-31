import {
  agentNameFor,
  InvalidInputError,
  parseAgentToStart,
  parseBranch,
  parseTask,
  type AgentToStart,
  type Project,
} from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Result from 'effect/Result';
import type { CreateTaskInput, TaskAgentDto, TaskCreatedDto } from '../dto/task.dto.js';
import {
  BranchExistsError,
  type HerdrRejectedError,
  type HerdrUnavailableError,
} from '../errors.js';
import { HerdrOutbound, type CreatedWorktree } from '../ports/herdr.outbound.port.js';
import { ProjectsOutbound } from '../ports/projects.outbound.port.js';

// Creates a task (spec 005): checks every input before anything changes, creates the worktree
// through Herdr, then optionally starts an agent and sends it the task. Once the worktree exists
// the request succeeds; what fails after that becomes a note.

const issuesOf = <A>(result: Result.Result<A, InvalidInputError>): InvalidInputError['issues'] =>
  Result.isFailure(result) ? result.failure.issues : [];

const messageOf = (error: HerdrUnavailableError | HerdrRejectedError): string =>
  error._tag === 'HerdrRejectedError' ? error.message : error.reason;

export const makeCreateTask = Effect.gen(function* () {
  const projectsOutbound = yield* ProjectsOutbound;
  const herdrOutbound = yield* HerdrOutbound;

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

  // Starts the agent, and sends the task only to an agent that is idle and takes input: any
  // other agent may show a dialog, and the app never answers one for the owner.
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
    const { status, ready } = started.success;
    if (status !== 'idle' || !ready) {
      return {
        ref,
        started: true,
        prompted: false,
        note: 'The agent waits for an answer, so the task was not sent. Answer it, then send the task.',
      } satisfies TaskAgentDto;
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
        : yield* startAgent(worktree, kind.success, task.success.text);
    return {
      workspace: worktree.workspaceId,
      branch: worktree.branch,
      path: worktree.path,
      agent,
    } satisfies TaskCreatedDto;
  });

  return { create };
});
