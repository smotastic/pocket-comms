import { IMAGE_RETENTION_DAYS, parseImage } from '@pocket-comms/comms-domain';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { ImageDto } from '../dto/image.dto.js';
import { ImageNotFoundError } from '../errors.js';
import { ImagesOutbound } from '../ports/images.outbound.port.js';

const RETENTION_MILLIS = IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// The images the owner attaches (spec 014): an upload is checked by its content and kept under an
// id the store makes; old ones are swept.

export const makeImages = Effect.gen(function* () {
  const imagesOutbound = yield* ImagesOutbound;

  const upload = Effect.fn('Images.upload')(function* (bytes: Uint8Array) {
    const kind = yield* Effect.fromResult(parseImage(bytes));
    const id = yield* imagesOutbound.save({ kind, bytes });
    return { id } satisfies ImageDto;
  });

  const read = Effect.fn('Images.read')(function* (id: string) {
    const image = yield* imagesOutbound.read(id);
    if (Option.isNone(image)) return yield* new ImageNotFoundError({ id });
    return image.value;
  });

  const sweep = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const removed = yield* imagesOutbound.removeOlderThan(now - RETENTION_MILLIS);
    if (removed > 0)
      yield* Effect.logInfo('Old images removed').pipe(Effect.annotateLogs({ removed }));
  }).pipe(Effect.withSpan('Images.sweep'));

  return { upload, read, sweep };
});
