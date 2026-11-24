import * as Effect from 'effect/Effect';
import { NotAWorktreeError, WorktreeHasChangesError } from '../errors.js';
import { HerdrOutbound } from '../ports/herdr.outbound.port.js';
import { ProjectsOutbound } from '../ports/projects.outbound.port.js';
import { TaskStartsOutbound } from '../ports/task-starts.outbound.port.js';
import { makeLoadAgents } from './agents.js';

export const makeClose = Effect.gen(function* () {
  const herdrOutbound = yield* HerdrOutbound;
  const projectsOutbound = yield* ProjectsOutbound;
  const starts = yield* TaskStartsOutbound;
  const { find } = yield* makeLoadAgents;

  /**
   * Removes the worktree of the agent `ref` and closes its workspace, with every agent in it.
   * Only a workspace that both Herdr and git know as a linked worktree of a project
   * is removed; without `force`, one with changes is not.
   */
  const close = Effect.fn('Agent.close')(function* (ref: string, force: boolean) {
    const { workspace } = yield* find(ref);
    const notAWorktree = new NotAWorktreeError({ ref });
    if (
      workspace?.worktree === undefined ||
      workspace.checkout === undefined ||
      workspace.root === undefined
    ) {
      return yield* notAWorktree;
    }
    const { checkout, root } = workspace;
    const project = (yield* projectsOutbound.list).find((each) => each.path === root);
    if (project === undefined) return yield* notAWorktree;
    // git lists the primary checkout first; only the linked worktrees after it may be removed.
    const linked = (yield* projectsOutbound.worktrees(project)).slice(1);
    if (!linked.some((worktree) => worktree.path === checkout)) return yield* notAWorktree;
    if (!force && (yield* projectsOutbound.hasChanges(project, checkout))) {
      return yield* new WorktreeHasChangesError({ ref });
    }
    yield* herdrOutbound.removeWorktree({ workspaceId: workspace.id, force });
    // The closed agent's task start goes with it (spec 032); a file that fails is only logged.
    yield* starts
      .forget(checkout)
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning('Task start not forgotten').pipe(
            Effect.annotateLogs({ folder: checkout, reason: error.reason }),
          ),
        ),
      );
  });

  return { close };
});
