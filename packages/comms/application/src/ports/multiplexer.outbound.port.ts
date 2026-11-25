import type {
  Agent,
  DialogKey,
  AgentStatus,
  AgentToStart,
  Workspace,
} from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Stream from 'effect/Stream';
import type { MultiplexerRejectedError, MultiplexerUnavailableError } from '../errors.js';

/** The live agents and the workspaces, both in the multiplexer's order. */
export interface MultiplexerSnapshot {
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

/** What `openWorktree` asks for: the existing worktree at `path` of the repository at `cwd`. */
export interface WorktreeOpening {
  readonly cwd: string;
  readonly path: string;
}

/** A workspace and a pane in it. */
export interface OpenedPane {
  readonly workspaceId: string;
  readonly paneId: string;
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

/** An agent as the multiplexer reports it: its status, and whether it takes input. */
export interface StartedAgent {
  readonly status: AgentStatus;
  readonly ready: boolean;
}

/**
 * The terminal multiplexer that runs the agents, such as Herdr (ADR 0015). A `target` is an
 * agent's name or pane id. The port has no way to focus a pane on purpose: reading in the app
 * never moves the owner's focus on the desktop.
 */
export class MultiplexerOutbound extends Context.Service<
  MultiplexerOutbound,
  {
    readonly snapshot: Effect.Effect<MultiplexerSnapshot, MultiplexerUnavailableError>;
    /** The visible screen of the agent's pane, with its ANSI escape sequences. */
    readonly readScreen: (
      target: string,
    ) => Effect.Effect<string, MultiplexerUnavailableError | MultiplexerRejectedError>;
    /** Types `text` into the agent and submits it, without waiting for the reply. */
    readonly prompt: (
      target: string,
      text: string,
    ) => Effect.Effect<void, MultiplexerUnavailableError | MultiplexerRejectedError>;
    /**
     * Types `text` into the pane as it is, without pressing Enter, such as an answer to a waiting
     * dialog. `paneId` is a pane id, never an agent's name.
     */
    readonly typeText: (
      paneId: string,
      text: string,
    ) => Effect.Effect<void, MultiplexerUnavailableError | MultiplexerRejectedError>;
    /** Presses `keys` in order in the pane `paneId`, never an agent's name. */
    readonly sendKeys: (
      paneId: string,
      keys: ReadonlyArray<DialogKey>,
    ) => Effect.Effect<void, MultiplexerUnavailableError | MultiplexerRejectedError>;
    /** Creates a git worktree and opens it as a workspace, without moving the focus. */
    readonly createWorktree: (
      request: WorktreeRequest,
    ) => Effect.Effect<CreatedWorktree, MultiplexerUnavailableError | MultiplexerRejectedError>;
    /**
     * Opens an existing git worktree as a workspace, without moving the focus. When the
     * multiplexer already has one for it, that workspace and its first pane, which may hold an
     * agent.
     */
    readonly openWorktree: (
      opening: WorktreeOpening,
    ) => Effect.Effect<
      OpenedPane & { readonly alreadyOpen: boolean },
      MultiplexerUnavailableError | MultiplexerRejectedError
    >;
    /** Opens a new shell in the workspace, in a tab of its own, without moving the focus. */
    readonly openShell: (
      workspaceId: string,
    ) => Effect.Effect<OpenedPane, MultiplexerUnavailableError | MultiplexerRejectedError>;
    /**
     * Removes the checkout of a worktree workspace and closes the workspace with all its panes.
     * The branch stays.
     */
    readonly removeWorktree: (
      removal: WorktreeRemoval,
    ) => Effect.Effect<void, MultiplexerUnavailableError | MultiplexerRejectedError>;
    /**
     * One agent as the multiplexer reports it now. Herdr finishes an agent's start, and lets it
     * take a prompt, only when the agent is read this way; `snapshot` never does.
     */
    readonly readAgent: (
      target: string,
    ) => Effect.Effect<StartedAgent, MultiplexerUnavailableError | MultiplexerRejectedError>;
    /**
     * Starts an agent in a pane at its shell prompt. The multiplexer may answer before the agent
     * takes input; `readAgent` tells when it does.
     */
    readonly startAgent: (
      start: AgentStart,
    ) => Effect.Effect<StartedAgent, MultiplexerUnavailableError | MultiplexerRejectedError>;
    /**
     * Emits whenever the agents or workspaces may have changed, and at least every few seconds.
     * It never fails: while the multiplexer is unreachable it keeps emitting, so a reader learns
     * that too.
     */
    readonly changes: Stream.Stream<void>;
  }
>()('comms/application/MultiplexerOutbound') {}
