import * as Data from 'effect/Data';

// Failures that the use cases and outbound ports report. Input rule failures live in the domain.

/** No live agent has this name or pane id. */
export class AgentNotFoundError extends Data.TaggedError('AgentNotFoundError')<{
  readonly ref: string;
}> {}

/** The Herdr socket cannot be reached, or it answered something the app cannot read. */
export class HerdrUnavailableError extends Data.TaggedError('HerdrUnavailableError')<{
  readonly reason: string;
}> {}

/** Herdr refused a command for an agent, such as a prompt to an agent that is not ready. */
export class HerdrRejectedError extends Data.TaggedError('HerdrRejectedError')<{
  readonly ref: string;
  readonly code: string;
  readonly message: string;
}> {}

/** The agent's workspace is not a linked worktree of a project, so the app may not close it. */
export class NotAWorktreeError extends Data.TaggedError('NotAWorktreeError')<{
  readonly ref: string;
}> {}

/** The agent's worktree has uncommitted or untracked changes that removing it would lose. */
export class WorktreeHasChangesError extends Data.TaggedError('WorktreeHasChangesError')<{
  readonly ref: string;
}> {}

/** The agent has no session file the app can show as a chat. */
export class TranscriptUnavailableError extends Data.TaggedError('TranscriptUnavailableError')<{
  readonly ref: string;
  readonly reason: string;
}> {}

/** Git could not prepare the project, such as a failed fetch or no default remote branch. */
export class ProjectGitError extends Data.TaggedError('ProjectGitError')<{
  readonly project: string;
  readonly reason: string;
}> {}

/** The branch of a new worktree exists already, locally or on `origin`. */
export class BranchExistsError extends Data.TaggedError('BranchExistsError')<{
  readonly branch: string;
}> {}

/** No project of the projects root has this name. */
export class ProjectNotFoundError extends Data.TaggedError('ProjectNotFoundError')<{
  readonly project: string;
}> {}

/** The project's `origin` is not a repository on the app's Gitea. */
export class NoGiteaRemoteError extends Data.TaggedError('NoGiteaRemoteError')<{
  readonly project: string;
}> {}

/** The app has no Gitea token, so it cannot read issues. */
export class GiteaNotConfiguredError extends Data.TaggedError('GiteaNotConfiguredError') {}

/**
 * Gitea cannot be reached, answered an error, refused the token or does not know the
 * repository. `reason` is Gitea's; it never holds the token.
 */
export class GiteaUnavailableError extends Data.TaggedError('GiteaUnavailableError')<{
  readonly reason: string;
}> {}

/** The repository has no issue with this number; a pull request counts as none. */
export class IssueNotFoundError extends Data.TaggedError('IssueNotFoundError')<{
  readonly number: number;
}> {}

/** The issue is closed, so there is nothing to implement. */
export class IssueClosedError extends Data.TaggedError('IssueClosedError')<{
  readonly number: number;
}> {}

/** The agent runtime failed a turn, such as a model that cannot be reached. */
export class AgentRuntimeError extends Data.TaggedError('AgentRuntimeError')<{
  readonly reason: string;
}> {}

/** The server has no model for the brainstorm chat; `reason` names the missing setting. */
export class BrainstormNotSetUpError extends Data.TaggedError('BrainstormNotSetUpError')<{
  readonly reason: string;
}> {}

/** Pi is still answering, so the chat takes no new message or decision yet. */
export class BrainstormBusyError extends Data.TaggedError('BrainstormBusyError') {}

/** The brainstorm chat has no proposal with this id. */
export class ProposalNotFoundError extends Data.TaggedError('ProposalNotFoundError')<{
  readonly id: string;
}> {}

/** The proposal was decided already; it is decided once. */
export class ProposalDecidedError extends Data.TaggedError('ProposalDecidedError')<{
  readonly id: string;
}> {}

/** The image could not be kept, such as on a full disk; `reason` says why. */
export class ImageNotSavedError extends Data.TaggedError('ImageNotSavedError')<{
  readonly reason: string;
}> {}

/** The server keeps no image with this id: it never existed or was removed (spec 014). */
export class ImageNotFoundError extends Data.TaggedError('ImageNotFoundError')<{
  readonly id: string;
}> {}

/** The server cannot keep or read its push devices or its push keys. */
export class PushStoreError extends Data.TaggedError('PushStoreError')<{
  readonly reason: string;
}> {}
