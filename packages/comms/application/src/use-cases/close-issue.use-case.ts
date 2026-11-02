import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { CloseIssueInput } from '../dto/issue.dto.js';
import { IssueNotFoundError, NoGiteaRemoteError } from '../errors.js';
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { makeIssueProject } from './issue-project.js';

/**
 * Closes an issue (spec 010): reads it from Gitea again, so a pull request is never closed, and
 * writes only when it is still open. Closing a closed issue succeeds.
 */
export const makeCloseIssue = Effect.gen(function* () {
  const giteaOutbound = yield* GiteaOutbound;
  const issueProject = yield* makeIssueProject;

  const close = Effect.fn('Issues.close')(function* (input: CloseIssueInput) {
    const { project, repository } = yield* issueProject(input.project);
    if (Option.isNone(repository)) {
      return yield* new NoGiteaRemoteError({ project: project.name });
    }
    const issue = yield* giteaOutbound.issue(repository.value, input.number);
    if (issue.pull) return yield* new IssueNotFoundError({ number: input.number });
    if (issue.state !== 'open') return;
    yield* giteaOutbound.closeIssue(repository.value, input.number);
  });

  return { close };
});
