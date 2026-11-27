import { AutopilotInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

/** Implements the `autopilot` group (spec 038); the wire shapes equal the application DTOs. */
export const autopilotHandlers = HttpApiBuilder.group(
  CommsApi,
  'autopilot',
  Effect.fn(function* (handlers) {
    const autopilotInbound = yield* AutopilotInbound;

    return handlers
      .handle('read', () => autopilotInbound.view)
      .handle('updateSettings', ({ payload }) =>
        autopilotInbound.update(payload).pipe(
          Effect.catchTags({
            InvalidInputError: problems.invalidInput,
            AutopilotStoreError: problems.autopilotUnavailable,
          }),
        ),
      );
  }),
);
