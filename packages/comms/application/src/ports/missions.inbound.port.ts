import type { InvalidInputError, Lane } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { MissionDto, MissionOutcomeInput, MissionsDto } from '../dto/mission.dto.js';
import type {
  GiteaNotConfiguredError,
  GiteaUnavailableError,
  IssueNotFoundError,
  MissionNotFoundError,
  MissionRefusedError,
  MissionsStoreError,
  MultiplexerRejectedError,
  MultiplexerUnavailableError,
  NoGiteaRemoteError,
  PlanetNotFoundError,
} from '../errors.js';
import { makeMissions } from '../use-cases/missions.use-case.js';

// The inbound port of missions (spec 035): sending an issue on a mission, the mission queue, the
// running mission and the mission log. Its layer also runs the loop that follows the missions.

export class MissionsInbound extends Context.Service<
  MissionsInbound,
  {
    /** Sends an issue on a mission; `autopilot` marks one Autopilot sent (spec 038). */
    readonly send: (
      planet: string,
      number: number,
      lane: Lane,
      options?: { readonly autopilot?: boolean },
    ) => Effect.Effect<
      MissionDto,
      | MissionRefusedError
      | PlanetNotFoundError
      | NoGiteaRemoteError
      | IssueNotFoundError
      | GiteaNotConfiguredError
      | GiteaUnavailableError
      | MissionsStoreError
    >;
    readonly list: Effect.Effect<MissionsDto>;
    /** Removes a queued mission; it leaves no trace in the mission log. */
    readonly remove: (id: string) => Effect.Effect<void, MissionNotFoundError | MissionsStoreError>;
    /** Stops the running mission, keeping its branch and worktree. */
    readonly abort: (id: string) => Effect.Effect<void, MissionNotFoundError | MissionsStoreError>;
    /** Starts Claude again with its conversation for a lost mission. */
    readonly resume: (
      id: string,
    ) => Effect.Effect<
      void,
      | MissionNotFoundError
      | MissionsStoreError
      | MultiplexerUnavailableError
      | MultiplexerRejectedError
    >;
    /**
     * The owner's Deploy of a mission that waits for it (spec 036): the planet's waiting missions
     * join the mission queue to release and deploy together. Refused while the planet is no-go,
     * at manual or does not deploy (spec 037).
     */
    readonly deploy: (
      id: string,
    ) => Effect.Effect<void, MissionNotFoundError | MissionRefusedError | MissionsStoreError>;
    /**
     * The owner's Resume of a paused planet (spec 037): its latest failed deploy no longer pauses
     * it, and the bot closes the fix issue. Refused when the planet is not paused.
     */
    readonly resumePlanet: (
      planet: string,
    ) => Effect.Effect<void, MissionRefusedError | MissionsStoreError>;
    /** Marks the mission log seen now. */
    readonly seen: () => Effect.Effect<void, MissionsStoreError>;
    /** The outcome the running mission's agent reports, by the agent's name. */
    readonly outcome: (
      agent: string,
      input: MissionOutcomeInput,
    ) => Effect.Effect<void, MissionNotFoundError | MissionsStoreError | InvalidInputError>;
  }
>()('comms/application/MissionsInbound') {
  static readonly layer = Layer.effect(MissionsInbound, makeMissions);
}
