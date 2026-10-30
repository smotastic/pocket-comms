import { createBookmark } from '@pocket-comms/bookmarks-domain';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import { toBookmarkDto, type CreateBookmarkInput } from '../dto/bookmark.dto.js';
import {
  BookmarkRepositoryOutbound,
  IdGeneratorOutbound,
} from '../ports/bookmark.outbound.port.js';

export const makeCreateBookmark = Effect.gen(function* () {
  const bookmarkRepositoryOutbound = yield* BookmarkRepositoryOutbound;
  const idGeneratorOutbound = yield* IdGeneratorOutbound;

  const create = Effect.fn('CreateBookmark.create')(function* (input: CreateBookmarkInput) {
    const bookmark = yield* Effect.fromResult(
      createBookmark({
        id: yield* idGeneratorOutbound.next,
        input,
        now: yield* DateTime.now,
      }),
    );
    yield* bookmarkRepositoryOutbound.insert(bookmark);
    return toBookmarkDto(bookmark);
  });

  return { create };
});
