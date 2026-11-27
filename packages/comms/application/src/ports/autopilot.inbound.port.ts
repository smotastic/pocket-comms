import type { AutopilotSettings, InvalidInputError } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { AutopilotDto } from '../dto/autopilot.dto.js';
import type { AutopilotStoreError } from '../errors.js';
import { makeAutopilot } from '../use-cases/autopilot.use-case.js';
import { MissionsInbound } from './missions.inbound.port.js';

// The inbound port of Autopilot (spec 038): its settings, and the current or latest window. Its
// layer also runs the Autopilot loop.

export class AutopilotInbound extends Context.Service<
  AutopilotInbound,
  {
    readonly view: Effect.Effect<AutopilotDto>;
    /** Keeps the owner's settings: the switch, the window and the budget. */
    readonly update: (
      settings: AutopilotSettings,
    ) => Effect.Effect<AutopilotDto, InvalidInputError | AutopilotStoreError>;
  }
>()('comms/application/AutopilotInbound') {
  // The same missions layer as the server's, so there is one mission loop (layers are shared).
  static readonly layer = Layer.effect(AutopilotInbound, makeAutopilot).pipe(
    Layer.provide(MissionsInbound.layer),
  );
}
