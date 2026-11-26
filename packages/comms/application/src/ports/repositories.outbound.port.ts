import type { Repository, RepositoryDoc, Worktree } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type { RepositoryGitError } from '../errors.js';

/**
 * The git repositories below the repositories root, the git questions a new or closing worktree asks,
 * and the top-level docs the brainstorm reads.
 */
export class RepositoriesOutbound extends Context.Service<
  RepositoriesOutbound,
  {
    /** The primary checkouts directly below the root; none when the root does not exist. */
    readonly list: Effect.Effect<ReadonlyArray<Repository>>;
    /** Whether git accepts `branch` as a branch name (`check-ref-format --branch`). */
    readonly isValidBranchName: (
      planet: Repository,
      branch: string,
    ) => Effect.Effect<boolean, RepositoryGitError>;
    /** Fetches `origin` and names its default branch, such as `origin/master`. */
    readonly defaultBase: (planet: Repository) => Effect.Effect<string, RepositoryGitError>;
    /** Whether `branch` exists locally or on `origin`, as of the last fetch. */
    readonly branchExists: (
      planet: Repository,
      branch: string,
    ) => Effect.Effect<boolean, RepositoryGitError>;
    /** The URL of the `origin` remote, or none when the planet has no such remote. */
    readonly originUrl: (planet: Repository) => Effect.Effect<Option.Option<string>>;
    /** Every worktree of the planet, the primary checkout first, with its branch. */
    readonly worktrees: (
      planet: Repository,
    ) => Effect.Effect<ReadonlyArray<Worktree>, RepositoryGitError>;
    /**
     * Adds a worktree on the new branch `branch`, started from `base`, in a folder of its own
     * below the worktrees root (ADR 0015). The branch must not exist yet.
     */
    readonly addWorktree: (
      planet: Repository,
      request: { readonly branch: string; readonly base: string },
    ) => Effect.Effect<{ readonly path: string; readonly branch: string }, RepositoryGitError>;
    /**
     * Removes the linked worktree of `planet` at `path` and its folder; the branch stays. Without
     * `force`, git refuses one with changes.
     */
    readonly removeWorktree: (
      planet: Repository,
      path: string,
      force: boolean,
    ) => Effect.Effect<void, RepositoryGitError>;
    /** Whether the worktree of `planet` at `path` has uncommitted or untracked changes. */
    readonly hasChanges: (
      planet: Repository,
      path: string,
    ) => Effect.Effect<boolean, RepositoryGitError>;
    /**
     * The text of a doc at the planet's top level; none when it is missing, unreadable or not a
     * regular file (a symlink counts as none).
     */
    readonly readDoc: (
      planet: Repository,
      doc: RepositoryDoc,
    ) => Effect.Effect<Option.Option<string>>;
  }
>()('comms/application/RepositoriesOutbound') {}
