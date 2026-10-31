import { issueTask } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { ImplementIssueInput } from '../dto/issue.dto.js';
import { IssueClosedError, IssueNotFoundError, NoGiteaRemoteError } from '../errors.js';
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { makeCreateTask } from './create-task.use-case.js';
import { makeIssueProject } from './issue-project.js';

/**
 * Implements an issue (spec 006): reads it from Gitea again and creates the spec 005 task with a
 * Claude agent and the issue as its first prompt, so every rule of the New task flow holds.
 */
export const makeImplementIssue = Effect.gen(function* () {
  const giteaOutbound = yield* GiteaOutbound;
  const issueProject = yield* makeIssueProject;
  const { create } = yield* makeCreateTask;

  const implement = Effect.fn('Issues.implement')(function* (input: ImplementIssueInput) {
    const { project, repository } = yield* issueProject(input.project);
    if (Option.isNone(repository)) {
      return yield* new NoGiteaRemoteError({ project: project.name });
    }
    const issue = yield* giteaOutbound.issue(repository.value, input.number);
    if (issue.pull) return yield* new IssueNotFoundError({ number: input.number });
    if (issue.state !== 'open') return yield* new IssueClosedError({ number: input.number });
    return yield* create({
      project: project.name,
      task: issueTask(issue),
      branch: input.branch,
      agent: 'claude',
    });
  });

  return { implement };
});
