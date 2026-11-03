import type { ImageKind } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type { ImageNotSavedError } from '../errors.js';

/** An image as the store keeps it. */
export interface StoredImage {
  readonly kind: ImageKind;
  readonly bytes: Uint8Array;
}

/**
 * Where attached images are kept (spec 014): files in one folder, named by ids the store makes.
 * Nothing that comes from a request becomes part of a name or a path.
 */
export class ImagesOutbound extends Context.Service<
  ImagesOutbound,
  {
    /** The absolute folder of the images; the agent gets paths below it. */
    readonly folder: string;
    /** Keeps the image and answers its new id. */
    readonly save: (image: StoredImage) => Effect.Effect<string, ImageNotSavedError>;
    /** The absolute path of a kept image; none when there is no image with this id. */
    readonly path: (id: string) => Effect.Effect<Option.Option<string>>;
    readonly read: (id: string) => Effect.Effect<Option.Option<StoredImage>>;
    /**
     * Removes the images saved before `epochMillis`, and what a failed save left behind, and
     * answers how many images went.
     */
    readonly removeOlderThan: (epochMillis: number) => Effect.Effect<number>;
  }
>()('comms/application/ImagesOutbound') {}
