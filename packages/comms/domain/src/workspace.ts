/** The overview group of a workspace: a repository with all its worktrees, or the workspace alone. */
export interface WorkspaceGroup {
  readonly key: string;
  readonly name: string;
}

/** A Herdr workspace, in Herdr's order. */
export interface Workspace {
  readonly id: string;
  readonly label: string;
  readonly group: WorkspaceGroup;
}

/** The group of a workspace that is no worktree of a known repository. */
export const ownGroup = (id: string, label: string): WorkspaceGroup => ({
  key: `ws:${id}`,
  name: label,
});
