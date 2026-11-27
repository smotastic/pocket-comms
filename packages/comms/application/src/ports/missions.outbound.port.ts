import type { MissionsFile } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type { MissionsStoreError } from '../errors.js';

/**
 * The mission queue and every mission's state (spec 035, ADR 0019), the only source of truth of
 * missions. None saved yet, or a file that does not read, counts as no missions.
 */
export class MissionsOutbound extends Context.Service<
  MissionsOutbound,
  {
    readonly load: Effect.Effect<MissionsFile>;
    /** Keeps `file` in place of the saved one. */
    readonly save: (file: MissionsFile) => Effect.Effect<void, MissionsStoreError>;
  }
>()('comms/application/MissionsOutbound') {}
