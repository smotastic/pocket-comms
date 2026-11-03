import { PushInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

/** Implements the `push` group: the devices that get a notification. */
export const pushHandlers = HttpApiBuilder.group(
  CommsApi,
  'push',
  Effect.fn(function* (handlers) {
    const pushInbound = yield* PushInbound;

    return handlers
      .handle('key', () =>
        pushInbound.key.pipe(Effect.catchTags({ PushStoreError: problems.pushStoreUnavailable })),
      )
      .handle('subscribe', ({ payload }) =>
        pushInbound
          .subscribe({ endpoint: payload.endpoint, keys: payload.keys })
          .pipe(Effect.catchTags({ PushStoreError: problems.pushStoreUnavailable })),
      )
      .handle('unsubscribe', ({ payload }) =>
        pushInbound
          .unsubscribe(payload.endpoint)
          .pipe(Effect.catchTags({ PushStoreError: problems.pushStoreUnavailable })),
      );
  }),
);

/** Watches the agents and notifies the devices, for as long as the server runs. */
export const pushWatchLayer = Layer.effectDiscard(
  PushInbound.use((pushInbound) => pushInbound.watch.pipe(Effect.forkScoped)),
);
