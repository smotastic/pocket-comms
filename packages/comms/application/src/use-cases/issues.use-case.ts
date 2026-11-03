import {
  agentRef,
  isInProgress,
  issueBranch,
  orderIssues,
  workOnIssues,
  type Issue,
  type IssueWork,
} from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { IssueDto, IssueListDto } from '../dto/issue.dto.js';
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { HerdrOutbound } from '../ports/herdr.outbound.port.js';
import { ProjectsOutbound } from '../ports/projects.outbound.port.js';
import { makeIssueProject } from './issue-project.js';

// A project's open issues (spec 006), each with the worktrees and agents that work on it. The
// link is derived from git's worktrees and Herdr's agents on every request; nothing is stored.

const toDto = (issue: Issue, work: ReadonlyArray<IssueWork>): IssueDto => ({
  number: issue.number,
  title: issue.title,
  labels: issue.labels,
  updatedAt: issue.updatedAt,
  url: issue.url,
  branch: issueBranch(issue),
  work: work.map((each) => ({
    branch: each.branch,
    agents: each.agents.map((agent) => ({ ref: agentRef(agent), status: agent.status })),
  })),
  inProgress: isInProgress(issue, work),
});

export const makeIssues = Effect.gen(function* () {
  const projectsOutbound = yield* ProjectsOutbound;
  const giteaOutbound = yield* GiteaOutbound;
  const herdrOutbound = yield* HerdrOutbound;
  const issueProject = yield* makeIssueProject;

  const issues = Effect.fn('Issues.issues')(function* (name: string) {
    const { project, repository } = yield* issueProject(name);
    if (Option.isNone(repository)) return { _tag: 'NoGiteaRemote' } satisfies IssueListDto;
    const listed = yield* giteaOutbound
      .openIssues(repository.value)
      .pipe(Effect.catchTag('GiteaNotConfiguredError', () => Effect.succeed(undefined)));
    if (listed === undefined) return { _tag: 'NotConfigured' } satisfies IssueListDto;
    // Without git's worktrees or Herdr's agents the list still shows, only without its work.
    const worktrees = yield* projectsOutbound
      .worktrees(project)
      .pipe(Effect.orElseSucceed(() => []));
    const agents = yield* herdrOutbound.snapshot.pipe(
      Effect.map((snapshot) => snapshot.agents),
      Effect.orElseSucceed(() => []),
    );
    const work = workOnIssues(worktrees, agents);
    return {
      _tag: 'Listed',
      repository: repository.value,
      issues: orderIssues(listed).map((issue) => toDto(issue, work.get(issue.number) ?? [])),
    } satisfies IssueListDto;
  });

  return { issues };
});
