import { BookmarkId, InvalidBookmarkError, Tag } from '@pocket-comms/bookmarks-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import {
  toBookmarkDto,
  type ListBookmarksQuery,
  type ListPositionDto,
} from '../dto/bookmark.dto.js';
import { BookmarkRepositoryOutbound } from '../ports/bookmark.outbound.port.js';

const decodeField = <S extends Schema.Top & { readonly DecodingServices: never }>(
  field: string,
  schema: S,
  value: unknown,
) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(
      (error) => new InvalidBookmarkError({ issues: [{ field, message: error.message }] }),
    ),
  );

export const makeListBookmarks = Effect.gen(function* () {
  const bookmarkRepositoryOutbound = yield* BookmarkRepositoryOutbound;

  const list = Effect.fn('ListBookmarks.list')(function* (query: ListBookmarksQuery) {
    const tag =
      query.tag === undefined
        ? Option.none()
        : Option.some(yield* decodeField('tag', Tag, query.tag));
    const after =
      query.after === undefined
        ? Option.none()
        : Option.some({
            createdAt: query.after.createdAt,
            id: yield* decodeField('cursor', BookmarkId, query.after.id),
          });
    const page = yield* bookmarkRepositoryOutbound.list({
      tag,
      status: query.status,
      after,
      limit: query.limit,
    });
    return {
      items: page.items.map(toBookmarkDto),
      next: Option.map(page.next, ({ createdAt, id }): ListPositionDto => ({ createdAt, id })),
    };
  });

  return { list };
});
