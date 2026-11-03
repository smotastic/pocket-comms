import { MAX_IMAGE_BYTES } from '@pocket-comms/comms-domain';
import * as ByteSize from 'effect/ByteSize';
import * as Effect from 'effect/Effect';
import { HttpIncomingMessage, HttpRouter } from 'effect/http';

/** The largest request body: an image of the largest size (spec 014) with room for its framing. */
export const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 1024 * 1024;

/**
 * The body limit on every route. Node stops reading a larger body and the request fails, so an
 * oversized upload is never held in memory whole; the image rules then refuse anything over 10 MB.
 */
export const bodyLimit = HttpRouter.middleware(
  (httpEffect) =>
    httpEffect.pipe(
      Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(MAX_BODY_BYTES)),
    ),
  { global: true },
);
