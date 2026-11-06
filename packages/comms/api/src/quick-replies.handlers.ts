import { QuickRepliesInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

/** Implements the `quickReplies` group: the owner's own replies (spec 025). */
export const quickRepliesHandlers = HttpApiBuilder.group(
  CommsApi,
  'quickReplies',
  Effect.fn(function* (handlers) {
    const quickRepliesInbound = yield* QuickRepliesInbound;

    return handlers
      .handle('list', () =>
        quickRepliesInbound.list.pipe(
          Effect.catchTags({ QuickRepliesStoreError: problems.quickRepliesUnavailable }),
        ),
      )
      .handle('replace', ({ payload }) =>
        quickRepliesInbound.replace(payload.replies).pipe(
          Effect.catchTags({
            InvalidInputError: problems.invalidInput,
            QuickRepliesStoreError: problems.quickRepliesUnavailable,
          }),
        ),
      );
  }),
);
