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
  projectNotFound: (error: { readonly project: string }) =>
    Effect.fail(
      notFoundProblem({
        slug: 'project-not-found',
        title: 'Project not found',
        detail: `${error.project} is not a project below the projects root.`,
      }),
    ),
  noGiteaRemote: (error: { readonly project: string }) =>
    Effect.fail(
      conflictProblem({
        slug: 'no-gitea-remote',
        title: 'The project is not on Gitea',
        detail: `The origin of ${error.project} is not a repository on the app's Gitea.`,
      }),
    ),
  giteaNotConfigured: () =>
    Effect.fail(
      conflictProblem({
        slug: 'gitea-not-configured',
        title: 'Gitea is not configured',
        detail: 'Set COMMS_GITEA_TOKEN on the server to read Gitea issues.',
      }),
    ),
  giteaUnavailable: (error: { readonly reason: string }) =>
    Effect.fail(
      serviceUnavailableProblem({
        slug: 'gitea-unavailable',
        title: 'Gitea cannot be read',
        detail: error.reason,
      }),
    ),
  issueNotFound: (error: { readonly number: number }) =>
    Effect.fail(
      notFoundProblem({
        slug: 'issue-not-found',
        title: 'Issue not found',
        detail: `The repository has no issue #${error.number}.`,
      }),
    ),
  issueClosed: (error: { readonly number: number }) =>
    Effect.fail(
      conflictProblem({
        slug: 'issue-closed',
        title: 'The issue is closed',
        detail: `Issue #${error.number} is closed, so there is nothing to implement.`,
      }),
    ),
  invalidInput: (error: { readonly issues: ReadonlyArray<FieldIssue> }) =>
    Effect.fail(validationProblem(error.issues)),
};
