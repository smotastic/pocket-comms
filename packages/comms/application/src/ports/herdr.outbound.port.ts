import type {
  Agent,
  AgentKey,
  AgentStatus,
  AgentToStart,
  Workspace,
} from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Stream from 'effect/Stream';
import type { HerdrRejectedError, HerdrUnavailableError } from '../errors.js';

/** The live agents and the workspaces, both in Herdr's order. */
export interface HerdrSnapshot {
  readonly agents: ReadonlyArray<Agent>;
  readonly workspaces: ReadonlyArray<Workspace>;
}

/** What `createWorktree` asks for: a new branch from `base` in the repository at `cwd`. */
export interface WorktreeRequest {
  readonly cwd: string;
  readonly branch: string;
  readonly base: string;
  /** The label of the new workspace. */
  readonly label: string;
}

/** The new worktree's workspace and its first pane. */
export interface CreatedWorktree {
  readonly workspaceId: string;
  readonly paneId: string;
  readonly path: string;
  readonly branch: string;
}

/** What `removeWorktree` asks for: the worktree workspace, and whether to drop its changes. */
export interface WorktreeRemoval {
  readonly workspaceId: string;
  readonly force: boolean;
}

/** What `startAgent` asks for: an agent of `kind`, named `name`, in the shell of `paneId`. */
export interface AgentStart {
  readonly paneId: string;
  readonly name: string;
  readonly kind: AgentToStart;
}

/** The started agent as Herdr reports it: its status, and whether it takes input. */
export interface StartedAgent {
  readonly status: AgentStatus;
  readonly ready: boolean;
}

/**
 * Herdr, the terminal multiplexer that runs the agents. A `target` is an agent's name or pane id.
 * The port has no way to focus a pane on purpose: reading in the app never moves the owner's
 * focus on the desktop.
 */
export class HerdrOutbound extends Context.Service<
  HerdrOutbound,
  {
    readonly snapshot: Effect.Effect<HerdrSnapshot, HerdrUnavailableError>;
    /** The visible screen of the agent's pane, with its ANSI escape sequences. */
    readonly readScreen: (
      target: string,
    ) => Effect.Effect<string, HerdrUnavailableError | HerdrRejectedError>;
    /** Types `text` into the agent and submits it, without waiting for the reply. */
    readonly prompt: (
      target: string,
      text: string,
    ) => Effect.Effect<void, HerdrUnavailableError | HerdrRejectedError>;
    /**
     * Types `text` into the pane as it is, without pressing Enter, such as an answer to a waiting
     * dialog. `paneId` is a pane id, never an agent's name.
     */
    readonly typeText: (
      paneId: string,
      text: string,
    ) => Effect.Effect<void, HerdrUnavailableError | HerdrRejectedError>;
    /** Presses `keys` in order in the pane `paneId`, never an agent's name. */
    readonly sendKeys: (
      paneId: string,
      keys: ReadonlyArray<AgentKey>,
    ) => Effect.Effect<void, HerdrUnavailableError | HerdrRejectedError>;
    /** Creates a git worktree and opens it as a workspace, without moving the focus. */
    readonly createWorktree: (
      request: WorktreeRequest,
    ) => Effect.Effect<CreatedWorktree, HerdrUnavailableError | HerdrRejectedError>;
    /**
     * Removes the checkout of a worktree workspace and closes the workspace with all its panes.
     * The branch stays.
     */
    readonly removeWorktree: (
      removal: WorktreeRemoval,
    ) => Effect.Effect<void, HerdrUnavailableError | HerdrRejectedError>;
    /** Starts an agent in a pane at its shell prompt and waits until it is up. */
    readonly startAgent: (
      start: AgentStart,
    ) => Effect.Effect<StartedAgent, HerdrUnavailableError | HerdrRejectedError>;
    /**
     * Emits whenever the agents or workspaces may have changed, and at least every few seconds.
     * It never fails: while Herdr is unreachable it keeps emitting, so a reader learns that too.
     */
    readonly changes: Stream.Stream<void>;
  }
>()('comms/application/HerdrOutbound') {}
