import type { AutopilotFile } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type { AutopilotStoreError } from '../errors.js';

/**
 * The Autopilot file (spec 038): the owner's settings, what the triage wrote, and the current or
 * last Autopilot window. None saved yet, or a file that does not read, counts as the defaults.
 */
export class AutopilotOutbound extends Context.Service<
  AutopilotOutbound,
  {
    readonly load: Effect.Effect<AutopilotFile>;
    /** Keeps `file` in place of the saved one. */
    readonly save: (file: AutopilotFile) => Effect.Effect<void, AutopilotStoreError>;
  }
>()('comms/application/AutopilotOutbound') {}
