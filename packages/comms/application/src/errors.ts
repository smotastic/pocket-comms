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
