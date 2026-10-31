import type { Project, Worktree } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type { ProjectGitError } from '../errors.js';

/** The git repositories below the projects root, and the git questions a new worktree asks. */
export class ProjectsOutbound extends Context.Service<
  ProjectsOutbound,
  {
    /** The primary checkouts directly below the root; none when the root does not exist. */
    readonly list: Effect.Effect<ReadonlyArray<Project>>;
    /** Whether git accepts `branch` as a branch name (`check-ref-format --branch`). */
    readonly isValidBranchName: (
      project: Project,
      branch: string,
    ) => Effect.Effect<boolean, ProjectGitError>;
    /** Fetches `origin` and names its default branch, such as `origin/master`. */
    readonly defaultBase: (project: Project) => Effect.Effect<string, ProjectGitError>;
    /** Whether `branch` exists locally or on `origin`, as of the last fetch. */
    readonly branchExists: (
      project: Project,
      branch: string,
    ) => Effect.Effect<boolean, ProjectGitError>;
    /** The URL of the `origin` remote, or none when the project has no such remote. */
    readonly originUrl: (project: Project) => Effect.Effect<Option.Option<string>>;
    /** Every worktree of the project, the primary checkout first, with its branch. */
    readonly worktrees: (
      project: Project,
    ) => Effect.Effect<ReadonlyArray<Worktree>, ProjectGitError>;
  }
>()('comms/application/ProjectsOutbound') {}
