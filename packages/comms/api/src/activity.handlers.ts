import { ActivityInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';
import { HttpApiBuilder } from 'effect/http-api';

/** Implements the `activity` group (spec 017); the wire shapes equal the application DTOs. */
export const activityHandlers = HttpApiBuilder.group(
  CommsApi,
  'activity',
  Effect.fn(function* (handlers) {
    const activityInbound = yield* ActivityInbound;

    return handlers
      .handle('activity', () => activityInbound.activity)
      .handle('events', () =>
        Effect.succeed(
          activityInbound.activityChanges.pipe(Stream.map((data) => ({ event: 'activity', data }))),
        ),
      );
  }),
);
