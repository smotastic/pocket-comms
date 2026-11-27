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
    readonly send: (
      planet: string,
      number: number,
      lane: Lane,
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
