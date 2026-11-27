import type { AutonomyLevel, PreflightCheck, PreflightResult } from '@pocket-comms/comms-domain';
/** A planet the owner can start a task in. */
export interface PlanetDto {
  readonly name: string;
  /** Herdr has a workspace for it. */
  readonly open: boolean;
}

/** The planets in their order, and the repositories below the root that are not planets. */
export interface PlanetsDto {
  readonly planets: ReadonlyArray<PlanetDto>;
  readonly others: ReadonlyArray<string>;
}

/** A planet's preflight (spec 034): its checks, the result and the autonomy levels. */
export interface PreflightDto {
  readonly result: PreflightResult;
  readonly checks: ReadonlyArray<PreflightCheck>;
  readonly autonomy: { readonly chosen: AutonomyLevel; readonly effective: AutonomyLevel };
  /**
   * Whether the planet deploys its missions, with the deploy checks (spec 036), and the apps its
   * releases name, each allowed or not (spec 037).
   */
  readonly deploy: {
    readonly deploys: boolean;
    readonly checks: ReadonlyArray<PreflightCheck>;
    readonly apps: ReadonlyArray<{ readonly app: string; readonly allowed: boolean }>;
  };
  /** When the checks were computed, in epoch milliseconds. */
  readonly checkedAt: number;
}

/** What the owner asks for: a task in a planet, on a new branch, optionally with an agent. */
export interface CreateTaskInput {
  readonly planet: string;
  readonly task: string;
  readonly branch: string;
  /** The kind of agent to start, or none. */
  readonly agent?: string | undefined;
  /** The images the agent's first prompt attaches (spec 014); they need an agent. */
  readonly imageIds?: ReadonlyArray<string> | undefined;
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
