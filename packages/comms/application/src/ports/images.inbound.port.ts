import type { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { ImageDto } from '../dto/image.dto.js';
import type { ImageNotFoundError, ImageNotSavedError } from '../errors.js';
import { makeImages } from '../use-cases/images.use-case.js';
import type { StoredImage } from './images.outbound.port.js';

// The inbound port of the images resource (spec 014): uploads that a prompt or a task attaches
// later, and the images the chat shows again.

export class ImagesInbound extends Context.Service<
  ImagesInbound,
  {
    readonly upload: (
      bytes: Uint8Array,
    ) => Effect.Effect<ImageDto, InvalidInputError | ImageNotSavedError>;
    readonly read: (id: string) => Effect.Effect<StoredImage, ImageNotFoundError>;
    /** Removes the images older than the retention time. */
    readonly sweep: Effect.Effect<void>;
  }
>()('comms/application/ImagesInbound') {
  static readonly layer = Layer.effect(
    ImagesInbound,
    Effect.gen(function* () {
      return { ...(yield* makeImages) };
    }),
  );
}
