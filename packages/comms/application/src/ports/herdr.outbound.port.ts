import type { Agent, AgentKey, Workspace } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Stream from 'effect/Stream';
import type { HerdrRejectedError, HerdrUnavailableError } from '../errors.js';

/** The live agents and the workspaces, both in Herdr's order. */
export interface HerdrSnapshot {
  readonly agents: ReadonlyArray<Agent>;
  readonly workspaces: ReadonlyArray<Workspace>;
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
    readonly sendKeys: (
      target: string,
      keys: ReadonlyArray<AgentKey>,
    ) => Effect.Effect<void, HerdrUnavailableError | HerdrRejectedError>;
    /**
     * Emits whenever the agents or workspaces may have changed, and at least every few seconds.
     * It never fails: while Herdr is unreachable it keeps emitting, so a reader learns that too.
     */
    readonly changes: Stream.Stream<void>;
  }
>()('comms/application/HerdrOutbound') {}
