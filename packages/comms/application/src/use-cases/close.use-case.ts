import * as Effect from 'effect/Effect';
import { NotAWorktreeError, WorktreeHasChangesError } from '../errors.js';
import { MultiplexerOutbound } from '../ports/multiplexer.outbound.port.js';
import { RepositoriesOutbound } from '../ports/repositories.outbound.port.js';
import { TaskStartsOutbound } from '../ports/task-starts.outbound.port.js';
import { makeLoadAgents } from './agents.js';

export const makeClose = Effect.gen(function* () {
  const herdrOutbound = yield* MultiplexerOutbound;
  const planetsOutbound = yield* RepositoriesOutbound;
  const starts = yield* TaskStartsOutbound;
  const { find } = yield* makeLoadAgents;

  /**
   * Removes the worktree of the agent `ref` and closes its workspace, with every agent in it.
   * Only a workspace that both the multiplexer and git know as a linked worktree of a planet
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
    const planet = (yield* planetsOutbound.list).find((each) => each.path === root);
    if (planet === undefined) return yield* notAWorktree;
    // git lists the primary checkout first; only the linked worktrees after it may be removed.
    const linked = (yield* planetsOutbound.worktrees(planet)).slice(1);
    if (!linked.some((worktree) => worktree.path === checkout)) return yield* notAWorktree;
    if (!force && (yield* planetsOutbound.hasChanges(planet, checkout))) {
      return yield* new WorktreeHasChangesError({ ref });
    }
    // git removes the checkout first, so a refusal leaves the workspace and its agents open.
    yield* planetsOutbound.removeWorktree(planet, checkout, force);
    yield* herdrOutbound.closeWorkspace(workspace.id);
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
