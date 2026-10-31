import {
  conflictProblem,
  forbiddenProblem,
  notFoundProblem,
  serviceUnavailableProblem,
  validationProblem,
} from '@pocket-comms/backend-shared/http';
import type { FieldIssue } from '@pocket-comms/backend-shared';
import * as Effect from 'effect/Effect';

// One Problem Details response per tagged error of the use cases. The `type` URNs are part of
// the public contract: clients branch on them, so a slug never changes meaning.

export const forbidden = forbiddenProblem({
  slug: 'login-not-allowed',
  title: 'This login may not use pocket-comms',
  detail: 'Open the app through tailscale serve with the allowed Tailscale login.',
});

export const problems = {
  agentNotFound: (error: { readonly ref: string }) =>
    Effect.fail(
      notFoundProblem({
        slug: 'agent-not-found',
        title: 'Agent not found',
        detail: `No live agent is named ${error.ref}.`,
      }),
    ),
  transcriptUnavailable: (error: { readonly reason: string }) =>
    Effect.fail(
      notFoundProblem({
        slug: 'transcript-unavailable',
        title: 'The agent has no conversation to show',
        detail: error.reason,
      }),
    ),
  herdrUnavailable: (error: { readonly reason: string }) =>
    Effect.fail(
      serviceUnavailableProblem({
        slug: 'herdr-unavailable',
        title: 'Herdr is not running',
        detail: error.reason,
      }),
    ),
  herdrRejected: (error: { readonly code: string; readonly message: string }) =>
    Effect.fail(
      conflictProblem({
        slug: 'agent-refused-input',
        title: 'The agent did not take the input',
        detail: `${error.message} (${error.code})`,
      }),
    ),
  branchExists: (error: { readonly branch: string }) =>
    Effect.fail(
      conflictProblem({
        slug: 'branch-exists',
        title: 'The branch exists already',
        detail: `${error.branch} exists locally or on origin. Choose another name.`,
      }),
    ),
  projectGitFailed: (error: { readonly project: string; readonly reason: string }) =>
    Effect.fail(
      conflictProblem({
        slug: 'project-git-failed',
        title: 'git could not prepare the project',
        detail: `${error.project}: ${error.reason}`,
      }),
    ),
  worktreeRefused: (error: { readonly code: string; readonly message: string }) =>
    Effect.fail(
      conflictProblem({
        slug: 'worktree-refused',
        title: 'Herdr did not create the worktree',
        detail: `${error.message} (${error.code})`,
      }),
    ),
  invalidInput: (error: { readonly issues: ReadonlyArray<FieldIssue> }) =>
    Effect.fail(validationProblem(error.issues)),
};
