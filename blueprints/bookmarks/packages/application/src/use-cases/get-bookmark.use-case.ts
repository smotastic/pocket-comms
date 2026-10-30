import { BookmarkId } from '@pocket-comms/bookmarks-domain';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { toBookmarkDto } from '../dto/bookmark.dto.js';
import { BookmarkNotFoundError } from '../errors.js';
import { BookmarkRepositoryOutbound } from '../ports/bookmark.outbound.port.js';

/** An id that is no valid `BookmarkId` names no bookmark, so it is not found. */
export const parseBookmarkId = (id: string) =>
  Schema.decodeUnknownEffect(BookmarkId)(id).pipe(
    Effect.mapError(() => new BookmarkNotFoundError({ id })),
  );

export const makeGetBookmark = Effect.gen(function* () {
  const bookmarkRepositoryOutbound = yield* BookmarkRepositoryOutbound;

  const get = Effect.fn('GetBookmark.get')(function* (id: string) {
    const bookmark = yield* bookmarkRepositoryOutbound.findById(yield* parseBookmarkId(id));
    return toBookmarkDto(bookmark);
  });

  return { get };
});
