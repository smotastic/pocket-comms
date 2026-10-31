/** A project the owner can start a task in. */
export interface ProjectDto {
  readonly name: string;
  /** Herdr has a workspace for it. */
  readonly open: boolean;
}

/** What the owner asks for: a task in a project, on a new branch, optionally with an agent. */
export interface CreateTaskInput {
  readonly project: string;
  readonly task: string;
  readonly branch: string;
  /** The kind of agent to start, or none. */
  readonly agent?: string | undefined;
}

/** The agent started for a task; `note` says what did not happen and why. */
export interface TaskAgentDto {
  readonly ref: string;
  readonly started: boolean;
  readonly prompted: boolean;
  readonly note: string | undefined;
}

/** The new worktree, by its workspace, and its agent when one was asked for. */
export interface TaskCreatedDto {
  readonly workspace: string;
  readonly branch: string;
  readonly path: string;
  readonly agent: TaskAgentDto | undefined;
}
