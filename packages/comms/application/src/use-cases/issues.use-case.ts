import {
  agentRef,
  isInProgress,
  issueBranch,
  orderIssues,
  recoveryOf,
  workOnIssues,
  type Issue,
  type IssueWork,
  type TaskStart,
} from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { IssueDto, IssueListDto } from '../dto/issue.dto.js';
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { MultiplexerOutbound } from '../ports/multiplexer.outbound.port.js';
import { RepositoriesOutbound } from '../ports/repositories.outbound.port.js';
import { TaskStartsOutbound } from '../ports/task-starts.outbound.port.js';
import { makeIssuePlanet } from './issue-planet.js';

// A planet's open issues (spec 006), each with the worktrees and agents that work on it. The
// link is derived from git's worktrees and Herdr's agents on every request; nothing is stored.

const toDto = (
  issue: Issue,
  work: ReadonlyArray<IssueWork>,
  starts: ReadonlyArray<TaskStart>,
): IssueDto => ({
  number: issue.number,
  title: issue.title,
  labels: issue.labels,
  updatedAt: issue.updatedAt,
  url: issue.url,
  branch: issueBranch(issue),
  work: work.map((each) => ({
    branch: each.branch,
    agents: each.agents.map((agent) => ({ ref: agentRef(agent), status: agent.status })),
    recovery: recoveryOf(
      each,
      starts.find((start) => start.folder === each.path),
    ),
  })),
  inProgress: isInProgress(issue, work),
});

export const makeIssues = Effect.gen(function* () {
  const planetsOutbound = yield* RepositoriesOutbound;
  const giteaOutbound = yield* GiteaOutbound;
  const herdrOutbound = yield* MultiplexerOutbound;
  const taskStarts = yield* TaskStartsOutbound;
  const issuePlanet = yield* makeIssuePlanet;

  const issues = Effect.fn('Issues.issues')(function* (name: string) {
    const { planet, repository } = yield* issuePlanet(name);
    if (Option.isNone(repository)) return { _tag: 'NoGiteaRemote' } satisfies IssueListDto;
    const listed = yield* giteaOutbound
      .openIssues(repository.value)
      .pipe(Effect.catchTag('GiteaNotConfiguredError', () => Effect.succeed(undefined)));
    if (listed === undefined) return { _tag: 'NotConfigured' } satisfies IssueListDto;
    // Without git's worktrees or Herdr's agents the list still shows, only without its work.
    const worktrees = yield* planetsOutbound.worktrees(planet).pipe(Effect.option);
    const starts = yield* taskStarts.load.pipe(Effect.orElseSucceed(() => []));
    // A start whose worktree git no longer lists has nothing to recover (spec 032).
    if (Option.isSome(worktrees)) {
      const folders = new Set(worktrees.value.map((worktree) => worktree.path));
      yield* Effect.forEach(
        starts.filter((start) => start.planet === planet.name && !folders.has(start.folder)),
        (start) => taskStarts.forget(start.folder).pipe(Effect.ignore),
        { discard: true },
      );
    }
    const agents = yield* herdrOutbound.snapshot.pipe(
      Effect.map((snapshot) => snapshot.agents),
      Effect.orElseSucceed(() => []),
    );
    const work = workOnIssues(
      Option.getOrElse(worktrees, () => []),
      agents,
    );
    return {
      _tag: 'Listed',
      repository: repository.value,
      issues: orderIssues(listed).map((issue) =>
        toDto(issue, work.get(issue.number) ?? [], starts),
      ),
    } satisfies IssueListDto;
  });

  return { issues };
});
