/** The overview group of a workspace: a repository with all its worktrees, or Other. */
export interface WorkspaceGroup {
  readonly key: string;
  readonly name: string;
}

/** A Herdr workspace, in Herdr's order. */
export interface Workspace {
  readonly id: string;
  readonly label: string;
  readonly group: WorkspaceGroup;
  /** The folder of the workspace's repository (its primary checkout), when it is a git workspace. */
  readonly root?: string;
  /** The name of the workspace's repository; a workspace without one has no project. */
  readonly project?: string;
  /** The workspace's label when it is a linked worktree; a main checkout has none. */
  readonly worktree?: string;
  /** The folder of the workspace's own checkout, when it is a git workspace. */
  readonly checkout?: string;
}

/** The one group of every workspace without a project; the overview shows it last. */
export const OTHER_GROUP: WorkspaceGroup = { key: 'other', name: 'Other' };
