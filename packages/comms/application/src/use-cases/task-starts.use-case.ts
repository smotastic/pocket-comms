import {
  activitySubject,
  afterRestart,
  isInFolder,
  issueNumberOf,
  issueTask,
  parsePrompt,
  promptExcerpt,
  startFor,
  type Agent,
  type AgentToStart,
  type Project,
  type TaskStart,
  type Workspace,
  type Worktree,
} from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { TaskCreatedDto } from '../dto/task.dto.js';
import type {
  SendTaskStartInput,
  StartAgentInWorktreeInput,
  TaskStartDto,
  TaskStartSentDto,
} from '../dto/task-start.dto.js';
import {
  AgentNotReadyError,
  DeliveryUncertainError,
  IssueClosedError,
  IssueNotFoundError,
  NoGiteaRemoteError,
  NoTaskStartError,
  WorktreeBusyError,
  WorktreeNotFoundError,
} from '../errors.js';
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { MultiplexerOutbound } from '../ports/multiplexer.outbound.port.js';
import { ProjectsOutbound } from '../ports/projects.outbound.port.js';
import { TaskStartsOutbound } from '../ports/task-starts.outbound.port.js';
import { makeRecordActivity } from './activity-log.js';
import { makeAgentLaunch } from './agent-launch.js';
import { makeLoadAgents } from './agents.js';
import { makeIssueProject } from './issue-project.js';

// Recovering a task start (spec 032): the card in an agent's conversation reads the start of the
// agent's worktree and sends its prompt only when the owner says so; an issue's worktree without
// an agent gets one, with the kept prompt or the issue's task. Worktrees come only from git's
// list of a project, workspaces only from Herdr, never a path from a request.

/** An agent kind the app can start, from one Herdr names; any other is shown as Claude. */
const kindOf = (agent: Agent): AgentToStart => (agent.kind === 'pi' ? 'pi' : 'claude');

export const makeTaskStarts = Effect.gen(function* () {
  const herdrOutbound = yield* MultiplexerOutbound;
  const projectsOutbound = yield* ProjectsOutbound;
  const giteaOutbound = yield* GiteaOutbound;
  const starts = yield* TaskStartsOutbound;
  const issueProject = yield* makeIssueProject;
  const { load, find } = yield* makeLoadAgents;
  const { launch, deliver } = yield* makeAgentLaunch;
  const { record } = yield* makeRecordActivity;

  /** The linked worktree that holds `folder`'s checkout, and its project. */
  const linkedWorktree = Effect.fnUntraced(function* (workspace: Workspace | undefined) {
    if (workspace?.checkout === undefined || workspace.root === undefined) return undefined;
    const project = (yield* projectsOutbound.list).find((each) => each.path === workspace.root);
    if (project === undefined) return undefined;
    // git lists the primary checkout first; only the linked worktrees after it count.
    const linked = (yield* projectsOutbound.worktrees(project).pipe(Effect.orElseSucceed(() => [])))
      .slice(1)
      .find((worktree) => worktree.path === workspace.checkout);
    return linked === undefined ? undefined : { project, worktree: linked };
  });

  /** The open issue a worktree's branch works on, read from Gitea now. */
  const issueOf = Effect.fnUntraced(function* (project: Project, worktree: Worktree) {
    const number = worktree.branch === undefined ? undefined : issueNumberOf(worktree.branch);
    if (number === undefined) return undefined;
    const { repository } = yield* issueProject(project.name);
    if (Option.isNone(repository)) return undefined;
    const issue = yield* giteaOutbound.issue(repository.value, number);
    return issue.pull || issue.state !== 'open' ? undefined : issue;
  });

  /**
   * The agent, its kept start, and, with `fromIssue` and no kept start, the start its issue's
   * task makes. That one may have arrived already, so it is `uncertain`.
   */
  const startOf = Effect.fnUntraced(function* (ref: string, fromIssue: boolean) {
    const { views } = yield* load();
    const { agent, workspace } = yield* find(ref);
    const kept = startFor(
      yield* starts.load,
      agent,
      views.map((view) => view.agent),
    );
    if (kept !== undefined || !fromIssue) {
      return { agent, workspace, start: kept, source: 'kept' } as const;
    }
    const linked = yield* linkedWorktree(workspace);
    if (linked === undefined || linked.worktree.branch === undefined) {
      return { agent, workspace, start: undefined, source: 'issue' } as const;
    }
    const issue = yield* issueOf(linked.project, linked.worktree).pipe(
      Effect.orElseSucceed(() => undefined),
    );
    const start: TaskStart | undefined =
      issue === undefined
        ? undefined
        : {
            folder: linked.worktree.path,
            project: linked.project.name,
            branch: linked.worktree.branch,
            issue: issue.number,
            kind: kindOf(agent),
            agent: agent.name,
            prompt: issueTask(issue),
            delivery: 'uncertain',
            reason: undefined,
            at: 0,
          };
    return { agent, workspace, start, source: 'issue' } as const;
  });

  const readiness = (agent: Agent) =>
    herdrOutbound
      .readAgent(agent.paneId)
      .pipe(Effect.orElseSucceed(() => ({ status: agent.status, ready: false })));

  const forAgent = Effect.fn('TaskStarts.forAgent')(function* (ref: string, fromIssue: boolean) {
    const { agent, start, source } = yield* startOf(ref, fromIssue);
    if (start === undefined || start.delivery === 'delivered') return undefined;
    return {
      source,
      delivery: start.delivery,
      reason: start.reason,
      prompt: start.prompt,
      branch: start.branch,
      issue: start.issue,
      agent: yield* readiness(agent),
    } satisfies TaskStartDto;
  });

  // The server checks again what the card showed: the agent may have moved on since.
  const send = Effect.fn('TaskStarts.send')(function* (ref: string, input: SendTaskStartInput) {
    const prompt = yield* Effect.fromResult(parsePrompt(input.prompt, 0));
    const { agent, workspace, start } = yield* startOf(ref, input.fromIssue === true);
    if (start === undefined || start.delivery === 'delivered') {
      return yield* new NoTaskStartError({ ref });
    }
    if (start.delivery === 'pending') {
      return yield* new AgentNotReadyError({ ref, status: agent.status });
    }
    if (start.delivery === 'uncertain' && input.anyway !== true) {
      return yield* new DeliveryUncertainError({ ref });
    }
    // An agent that finished its turn takes input as an idle one does (Herdr's `done`).
    const now = yield* readiness(agent);
    if ((now.status !== 'idle' && now.status !== 'done') || !now.ready) {
      return yield* new AgentNotReadyError({ ref, status: now.status });
    }
    const outcome = yield* deliver(
      { ...start, prompt, agent: start.agent ?? agent.name, delivery: 'pending' },
      agent.paneId,
    );
    if (outcome._tag !== 'Refused') {
      yield* record([
        {
          type: 'prompt',
          excerpt: promptExcerpt(prompt),
          images: 0,
          agent: activitySubject(agent, workspace),
        },
      ]);
    }
    return outcome._tag === 'Accepted'
      ? ({ delivery: 'delivered', reason: undefined } satisfies TaskStartSentDto)
      : ({
          delivery: outcome._tag === 'Refused' ? 'not-sent' : 'uncertain',
          reason: outcome.reason,
        } satisfies TaskStartSentDto);
  });

  const dismiss = Effect.fn('TaskStarts.dismiss')(function* (ref: string) {
    const { start } = yield* startOf(ref, false);
    if (start !== undefined) yield* starts.forget(start.folder);
  });

  // An existing worktree of the issue gets an agent: never a new worktree, never a second agent.
  const startInWorktree = Effect.fn('TaskStarts.startInWorktree')(function* (
    input: StartAgentInWorktreeInput,
  ) {
    const { project, repository } = yield* issueProject(input.project);
    const worktree = (yield* projectsOutbound.worktrees(project))
      .slice(1)
      .find(
        (each) =>
          each.branch === input.branch &&
          each.branch !== undefined &&
          issueNumberOf(each.branch) === input.number,
      );
    if (worktree === undefined) return yield* new WorktreeNotFoundError({ branch: input.branch });
    const snapshot = yield* herdrOutbound.snapshot;
    const kept = (yield* starts.load).find((each) => each.folder === worktree.path);
    if (
      kept?.delivery === 'pending' ||
      snapshot.agents.some((agent) => isInFolder(agent.cwd, worktree.path))
    ) {
      return yield* new WorktreeBusyError({ branch: input.branch });
    }
    let prompt = kept?.prompt;
    if (prompt === undefined) {
      if (Option.isNone(repository)) {
        return yield* new NoGiteaRemoteError({ project: project.name });
      }
      const issue = yield* giteaOutbound.issue(repository.value, input.number);
      if (issue.pull) return yield* new IssueNotFoundError({ number: input.number });
      if (issue.state !== 'open') return yield* new IssueClosedError({ number: input.number });
      prompt = issueTask(issue);
    }
    const workspace = snapshot.workspaces.find((each) => each.checkout === worktree.path);
    let pane: { readonly workspaceId: string; readonly paneId: string };
    if (workspace === undefined) {
      const opened = yield* herdrOutbound.openWorktree({ cwd: project.path, path: worktree.path });
      // An open workspace's first pane may hold something else, so the agent gets a new shell.
      pane = opened.alreadyOpen ? yield* herdrOutbound.openShell(opened.workspaceId) : opened;
    } else {
      pane = yield* herdrOutbound.openShell(workspace.id);
    }
    const agent = yield* launch(
      {
        folder: worktree.path,
        project: project.name,
        branch: input.branch,
        issue: input.number,
      },
      pane.paneId,
      input.agent,
      prompt,
    );
    return {
      workspace: pane.workspaceId,
      branch: input.branch,
      path: worktree.path,
      agent,
    } satisfies TaskCreatedDto;
  });

  return { forAgent, send, dismiss, startInWorktree };
});

/** A start the server was still working on when it stopped reads as uncertain (spec 032). */
export const settleTaskStartsAfterRestart = Effect.gen(function* () {
  const starts = yield* TaskStartsOutbound;
  const kept = yield* starts.load;
  const settled = afterRestart(kept);
  yield* Effect.forEach(
    settled.filter((each, index) => each !== kept[index]),
    (each) => starts.put(each),
    { discard: true },
  );
}).pipe(
  Effect.catch((error) =>
    Effect.logWarning('Task starts not settled after the restart').pipe(
      Effect.annotateLogs({ reason: error.reason }),
    ),
  ),
);
