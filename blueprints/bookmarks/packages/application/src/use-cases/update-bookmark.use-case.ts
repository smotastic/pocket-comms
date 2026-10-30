import { changeBookmark } from '@pocket-comms/bookmarks-domain';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import { toBookmarkDto, type UpdateBookmarkInput } from '../dto/bookmark.dto.js';
import { VersionMismatchError } from '../errors.js';
import { BookmarkRepositoryOutbound } from '../ports/bookmark.outbound.port.js';
import { parseBookmarkId } from './get-bookmark.use-case.js';

export const makeUpdateBookmark = Effect.gen(function* () {
  const bookmarkRepositoryOutbound = yield* BookmarkRepositoryOutbound;

  const update = Effect.fn('UpdateBookmark.update')(function* (input: UpdateBookmarkInput) {
    const bookmark = yield* bookmarkRepositoryOutbound.findById(yield* parseBookmarkId(input.id));
    // The precondition comes first: a stale client learns that before any other failure.
    if (bookmark.version !== input.expectedVersion) {
      return yield* new VersionMismatchError({ id: input.id, expected: input.expectedVersion });
    }
    const changed = yield* Effect.fromResult(
      changeBookmark({
        bookmark,
        input: input.changes,
        now: yield* DateTime.now,
      }),
    );
    if (changed === bookmark) return toBookmarkDto(bookmark);
    yield* bookmarkRepositoryOutbound.update(changed, bookmark.version);
    return toBookmarkDto(changed);
  });

  return { update };
});
