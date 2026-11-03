import {
  PushKeysOutbound,
  PushSenderOutbound,
  PushSubscriptionsOutbound,
} from '@pocket-comms/comms-application';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { layerFile, type PushFileStoreOptions } from './file-store.js';
import { layerWebPush, type WebPushOptions } from './web-push.js';

/**
 * The push devices and keys in the state folder and the Web Push sender on one store. Only the
 * three ports come out: the private key stays between the store and the sender.
 */
export const layer = (options: PushFileStoreOptions & WebPushOptions) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const built = yield* Layer.build(
        layerWebPush(options).pipe(Layer.provideMerge(layerFile(options))),
      );
      return Context.make(
        PushSubscriptionsOutbound,
        Context.get(built, PushSubscriptionsOutbound),
      ).pipe(
        Context.add(PushKeysOutbound, Context.get(built, PushKeysOutbound)),
        Context.add(PushSenderOutbound, Context.get(built, PushSenderOutbound)),
      );
    }),
  );
