import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type { DeployError } from '../errors.js';

/** What pocket-cloud's deploy script says of one app, without changing anything. */
export interface DeployAppCheck {
  readonly app: string;
  /** Whether it knows the app, has its health URL and a version to roll back to. */
  readonly ready: boolean;
  /** One sentence that says why. */
  readonly reason: string;
}

/** One run of the deploy script: an app at a version. */
export interface DeployJob {
  /** Names the run's result file; unique per mission and release. */
  readonly id: string;
  readonly app: string;
  readonly version: string;
  /** Whether the script backs the app's database up first (the owner's Deploy). */
  readonly backup: boolean;
}

/** How a run of the deploy script ended, with its output. */
export interface DeployResult {
  /**
   * `deployed` when healthy; `rolled-back` when it failed and the previous version runs again;
   * `down` when the rollback was not healthy either; `failed` when it failed before deploying
   * (spec 037).
   */
  readonly result: 'deployed' | 'rolled-back' | 'down' | 'failed';
  readonly output: string;
}

/**
 * pocket-cloud's deploy script (spec 036, ADR 0020), whose path the server reads from
 * `COMMS_DEPLOY_SCRIPT`. A run goes on detached, so a restart of the server, as deploying comms
 * itself causes, does not stop it; its result waits in a file of the state folder.
 */
export class DeployOutbound extends Context.Service<
  DeployOutbound,
  {
    /** Whether the server knows the deploy script. */
    readonly configured: boolean;
    /** `deploy.sh check <app>`; an unknown script or a broken answer is not ready. */
    readonly check: (app: string) => Effect.Effect<DeployAppCheck>;
    /**
     * Starts `deploy.sh <app> <version>` detached, with the started process's id; it fails at
     * once when the script cannot start (spec 037).
     */
    readonly start: (job: DeployJob) => Effect.Effect<{ readonly pid: number }, DeployError>;
    /** Whether the process of a started deploy still runs (spec 037). */
    readonly running: (pid: number) => Effect.Effect<boolean>;
    /** The run's result once it wrote one. */
    readonly result: (id: string) => Effect.Effect<Option.Option<DeployResult>>;
  }
>()('comms/application/DeployOutbound') {}
