import type { AgentStatus } from '@pocket-comms/comms-domain';
import * as Data from 'effect/Data';

// Failures that the use cases and outbound ports report. Input rule failures live in the domain.

/** No live agent has this name or pane id. */
export class AgentNotFoundError extends Data.TaggedError('AgentNotFoundError')<{
  readonly ref: string;
}> {}

/** The multiplexer cannot be reached, or it answered something the app cannot read. */
export class MultiplexerUnavailableError extends Data.TaggedError('MultiplexerUnavailableError')<{
  readonly reason: string;
}> {}

/** The multiplexer refused a command for an agent, such as a prompt to one that is not ready. */
export class MultiplexerRejectedError extends Data.TaggedError('MultiplexerRejectedError')<{
  readonly ref: string;
  readonly code: string;
  readonly message: string;
}> {}

/** The agent's workspace is not a linked worktree of a planet, so the app may not close it. */
export class NotAWorktreeError extends Data.TaggedError('NotAWorktreeError')<{
  readonly ref: string;
}> {}

/** The agent's worktree has uncommitted or untracked changes that removing it would lose. */
export class WorktreeHasChangesError extends Data.TaggedError('WorktreeHasChangesError')<{
  readonly ref: string;
}> {}

/** The agent has no session file the app can show as a brainstorm. */
export class ConversationUnavailableError extends Data.TaggedError('ConversationUnavailableError')<{
  readonly ref: string;
  readonly reason: string;
}> {}

/**
 * The agent's question is no longer waiting as the owner saw it: it was answered, it moved on, or
 * the agent's screen does not show it.
 */
export class QuestionNotWaitingError extends Data.TaggedError('QuestionNotWaitingError')<{
  readonly ref: string;
  readonly reason: string;
}> {}

/** The agent's session has no subagent by that id, or its agent has no subagents at all. */
export class SubagentNotFoundError extends Data.TaggedError('SubagentNotFoundError')<{
  readonly ref: string;
  readonly subagent: string;
}> {}

/** Git could not prepare the planet, such as a failed fetch or no default remote branch. */
export class RepositoryGitError extends Data.TaggedError('RepositoryGitError')<{
  readonly planet: string;
  readonly reason: string;
}> {}

/** The branch of a new worktree exists already, locally or on `origin`. */
export class BranchExistsError extends Data.TaggedError('BranchExistsError')<{
  readonly branch: string;
}> {}

/** No planet of the repositories root has this name. */
export class PlanetNotFoundError extends Data.TaggedError('PlanetNotFoundError')<{
  readonly planet: string;
}> {}

/** The planet's `origin` is not a repository on the app's Gitea. */
export class NoGiteaRemoteError extends Data.TaggedError('NoGiteaRemoteError')<{
  readonly planet: string;
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

/**
 * Gitea has no such pull request, or the app's token cannot read it (spec 031); also a pull
 * request an agent has not attached.
 */
export class PullRequestNotFoundError extends Data.TaggedError('PullRequestNotFoundError')<{
  readonly owner: string;
  readonly name: string;
  readonly number: number;
}> {}

/** The input does not name a pull request on this app's Gitea; `reason` says why. */
export class InvalidPullRequestError extends Data.TaggedError('InvalidPullRequestError')<{
  readonly reason: string;
}> {}

/** The agent has no session id, so it has no conversation to attach a pull request to. */
export class NoConversationError extends Data.TaggedError('NoConversationError')<{
  readonly ref: string;
}> {}

/** The file of attached pull requests cannot be read or written; a broken file is never replaced. */
export class PullRequestsStoreError extends Data.TaggedError('PullRequestsStoreError')<{
  readonly reason: string;
}> {}

/** The planets file cannot be written. */
export class PlanetsStoreError extends Data.TaggedError('PlanetsStoreError')<{
  readonly reason: string;
}> {}

/** No repository below the root has this name. */
export class RepositoryNotFoundError extends Data.TaggedError('RepositoryNotFoundError')<{
  readonly name: string;
}> {}

/** The repository is a planet already. */
export class PlanetExistsError extends Data.TaggedError('PlanetExistsError')<{
  readonly planet: string;
}> {}

/** The file of task starts cannot be read or written; a broken file is never replaced. */
export class TaskStartsStoreError extends Data.TaggedError('TaskStartsStoreError')<{
  readonly reason: string;
}> {}

/** The agent is not idle and ready for input, so a task start's prompt is not sent to it. */
export class AgentNotReadyError extends Data.TaggedError('AgentNotReadyError')<{
  readonly ref: string;
  readonly status: AgentStatus;
}> {}

/** The prompt may have arrived already, so it is sent again only when the owner says so. */
export class DeliveryUncertainError extends Data.TaggedError('DeliveryUncertainError')<{
  readonly ref: string;
}> {}

/** The agent's worktree has no task start and no issue whose task could be sent. */
export class NoTaskStartError extends Data.TaggedError('NoTaskStartError')<{
  readonly ref: string;
}> {}

/** No linked worktree of the planet is on the branch of this issue. */
export class WorktreeNotFoundError extends Data.TaggedError('WorktreeNotFoundError')<{
  readonly branch: string;
}> {}

/** The worktree has a live agent, or one is being started, so no second agent is started. */
export class WorktreeBusyError extends Data.TaggedError('WorktreeBusyError')<{
  readonly branch: string;
}> {}

/** The issue's title or body changed since Pi read it, so an edit would overwrite newer work. */
export class IssueChangedError extends Data.TaggedError('IssueChangedError')<{
  readonly number: number;
}> {}

/** The issue is closed, so there is nothing to implement. */
export class IssueClosedError extends Data.TaggedError('IssueClosedError')<{
  readonly number: number;
}> {}

/** The server has no model for the brainstorm; `reason` names the missing setting. */
export class BrainstormNotSetUpError extends Data.TaggedError('BrainstormNotSetUpError')<{
  readonly reason: string;
}> {}

/** Pi is still answering, so the brainstorm takes no new message or decision yet. */
export class BrainstormBusyError extends Data.TaggedError('BrainstormBusyError') {}

/** The brainstorm has no proposal with this id. */
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

/** The server cannot keep or read the owner's quick replies. */
export class QuickRepliesStoreError extends Data.TaggedError('QuickRepliesStoreError')<{
  readonly reason: string;
}> {}

/** The missions file cannot be written. */
export class MissionsStoreError extends Data.TaggedError('MissionsStoreError')<{
  readonly reason: string;
}> {}

/** The Autopilot file cannot be written (spec 038). */
export class AutopilotStoreError extends Data.TaggedError('AutopilotStoreError')<{
  readonly reason: string;
}> {}

/** An issue cannot be sent on a mission now; `reason` says why (spec 035). */
export class MissionRefusedError extends Data.TaggedError('MissionRefusedError')<{
  readonly reason: string;
}> {}

/** No mission has this id, or none is in a state that allows the request. */
export class MissionNotFoundError extends Data.TaggedError('MissionNotFoundError')<{
  readonly id: string;
}> {}

/** The mission bot could not do something on Gitea or in git; `reason` says what. */
export class MissionBotError extends Data.TaggedError('MissionBotError')<{
  readonly reason: string;
}> {}

/** pocket-cloud's deploy script could not be started (spec 036). */
export class DeployError extends Data.TaggedError('DeployError')<{
  readonly reason: string;
}> {}
