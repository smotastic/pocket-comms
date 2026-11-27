import { MissionsInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

/** Implements the `missions` group (spec 035); the wire shapes equal the application DTOs. */
export const missionsHandlers = HttpApiBuilder.group(
  CommsApi,
  'missions',
  Effect.fn(function* (handlers) {
    const missionsInbound = yield* MissionsInbound;
    const kept = {
      MissionNotFoundError: problems.missionNotFound,
      MissionsStoreError: problems.missionsUnavailable,
    };

    return handlers
      .handle('list', () => missionsInbound.list)
      .handle('remove', ({ params }) =>
        missionsInbound.remove(params.mission).pipe(Effect.catchTags(kept)),
      )
      .handle('abort', ({ params }) =>
        missionsInbound.abort(params.mission).pipe(Effect.catchTags(kept)),
      )
      .handle('resume', ({ params }) =>
        missionsInbound.resume(params.mission).pipe(
          Effect.catchTags({
            ...kept,
            MultiplexerUnavailableError: problems.herdrUnavailable,
            MultiplexerRejectedError: (error) =>
              problems.missionsUnavailable({ reason: error.message }),
          }),
        ),
      )
      .handle('seen', () =>
        missionsInbound
          .seen()
          .pipe(Effect.catchTags({ MissionsStoreError: problems.missionsUnavailable })),
      )
      .handle('outcome', ({ params, payload }) =>
        missionsInbound
          .outcome(params.agent, payload)
          .pipe(Effect.catchTags({ ...kept, InvalidInputError: problems.invalidInput })),
      );
  }),
);
