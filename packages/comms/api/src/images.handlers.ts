import { ImagesInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schedule from 'effect/Schedule';
import { HttpServerResponse } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

const CONTENT_TYPES = { jpeg: 'image/jpeg', png: 'image/png' } as const;

/** Implements the `images` group (spec 014). */
export const imagesHandlers = HttpApiBuilder.group(
  CommsApi,
  'images',
  Effect.fn(function* (handlers) {
    const imagesInbound = yield* ImagesInbound;

    return (
      handlers
        // The body is the image itself; the use case checks what is in it.
        .handle('upload', ({ payload }) =>
          imagesInbound
            .upload(payload)
            .pipe(Effect.catchTags({ InvalidInputError: problems.invalidInput })),
        )
        // Raw, because the content type is the image's own. An id never changes its image.
        .handleRaw('read', ({ params }) =>
          imagesInbound.read(params.image).pipe(
            Effect.map((image) =>
              HttpServerResponse.uint8Array(image.bytes, {
                contentType: CONTENT_TYPES[image.kind],
                headers: { 'cache-control': 'private, max-age=31536000, immutable' },
              }),
            ),
            Effect.catchTags({ ImageNotFoundError: problems.imageNotFound }),
          ),
        )
    );
  }),
);

/** Removes old images at start-up and once a day, for as long as the server runs (spec 014). */
export const imageSweepLayer = Layer.effectDiscard(
  ImagesInbound.use((imagesInbound) =>
    imagesInbound.sweep.pipe(Effect.repeat(Schedule.spaced('24 hours')), Effect.forkScoped),
  ),
);
