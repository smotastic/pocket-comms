import { archiveBookmark } from '@pocket-comms/bookmarks-domain';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import { toBookmarkDto, type ArchiveBookmarkInput } from '../dto/bookmark.dto.js';
import { VersionMismatchError } from '../errors.js';
import { BookmarkRepositoryOutbound } from '../ports/bookmark.outbound.port.js';
import { parseBookmarkId } from './get-bookmark.use-case.js';

export const makeArchiveBookmark = Effect.gen(function* () {
  const bookmarkRepositoryOutbound = yield* BookmarkRepositoryOutbound;

  const archive = Effect.fn('ArchiveBookmark.archive')(function* (input: ArchiveBookmarkInput) {
    const bookmark = yield* bookmarkRepositoryOutbound.findById(yield* parseBookmarkId(input.id));
    if (input.expectedVersion !== undefined && bookmark.version !== input.expectedVersion) {
      return yield* new VersionMismatchError({ id: input.id, expected: input.expectedVersion });
    }
    const archived = archiveBookmark({ bookmark, now: yield* DateTime.now });
    if (archived === bookmark) return toBookmarkDto(bookmark);
    // Archiving keeps the URL, so a URL conflict here is a defect, not an expected failure.
    yield* bookmarkRepositoryOutbound
      .update(archived, bookmark.version)
      .pipe(Effect.catchTag('UrlAlreadyUsedError', Effect.die));
    return toBookmarkDto(archived);
  });

  return { archive };
});
