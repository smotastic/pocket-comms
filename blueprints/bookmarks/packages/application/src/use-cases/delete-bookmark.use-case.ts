import { Version } from '@pocket-comms/bookmarks-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import type { DeleteBookmarkInput } from '../dto/bookmark.dto.js';
import { VersionMismatchError } from '../errors.js';
import { BookmarkRepositoryOutbound } from '../ports/bookmark.outbound.port.js';
import { parseBookmarkId } from './get-bookmark.use-case.js';

export const makeDeleteBookmark = Effect.gen(function* () {
  const bookmarkRepositoryOutbound = yield* BookmarkRepositoryOutbound;

  const remove = Effect.fn('DeleteBookmark.delete')(function* (input: DeleteBookmarkInput) {
    const id = yield* parseBookmarkId(input.id);
    // No stored bookmark has a version below 1, so such a precondition can never match.
    const expected =
      input.expectedVersion === undefined
        ? Option.none()
        : Option.some(
            yield* Schema.decodeUnknownEffect(Version)(input.expectedVersion).pipe(
              Effect.mapError(
                () =>
                  new VersionMismatchError({ id: input.id, expected: input.expectedVersion ?? 0 }),
              ),
            ),
          );
    yield* bookmarkRepositoryOutbound.delete(id, expected);
  });

  return { delete: remove };
});
