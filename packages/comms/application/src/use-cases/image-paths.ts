import { InvalidInputError, parseImageIds } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { ImagesOutbound } from '../ports/images.outbound.port.js';

/**
 * The paths of the images a prompt attaches (spec 014, requirement 9), in order. An id the store
 * does not know refuses the whole prompt, before anything is sent.
 */
export const makeImagePaths = Effect.gen(function* () {
  const imagesOutbound = yield* ImagesOutbound;

  const imagePaths = Effect.fnUntraced(function* (ids: ReadonlyArray<string>) {
    const parsed = yield* Effect.fromResult(parseImageIds(ids));
    const paths: Array<string> = [];
    for (const id of parsed) {
      const path = yield* imagesOutbound.path(id);
      if (Option.isNone(path)) {
        return yield* new InvalidInputError({
          issues: [{ field: 'imageIds', message: `${id} is not an attached image.` }],
        });
      }
      paths.push(path.value);
    }
    return paths;
  });

  return { imagePaths };
});
