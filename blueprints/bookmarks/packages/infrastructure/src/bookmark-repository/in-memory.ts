import {
  BookmarkNotFoundError,
  BookmarkRepositoryOutbound,
  UrlAlreadyUsedError,
  VersionMismatchError,
} from '@pocket-comms/bookmarks-application';
import type { Bookmark } from '@pocket-comms/bookmarks-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Ref from 'effect/Ref';
import { newestFirst, positionOf } from './order.js';

/** A repository in process memory, for tests and local runs without PostgreSQL. */
export const layerInMemory = Layer.effect(
  BookmarkRepositoryOutbound,
  Effect.gen(function* () {
    const store = yield* Ref.make(new Map<string, Bookmark>());

    const findById = Effect.fn('BookmarkRepository.findById')(function* (id: string) {
      const bookmark = (yield* Ref.get(store)).get(id);
      if (bookmark === undefined) return yield* new BookmarkNotFoundError({ id });
      return bookmark;
    });

    const checkUrlFree = Effect.fnUntraced(function* (bookmark: Bookmark) {
      for (const other of (yield* Ref.get(store)).values()) {
        if (other.url === bookmark.url && other.id !== bookmark.id) {
          return yield* new UrlAlreadyUsedError({ url: bookmark.url });
        }
      }
    });

    const save = (bookmark: Bookmark) =>
      Ref.update(store, (bookmarks) => new Map(bookmarks).set(bookmark.id, bookmark));

    return BookmarkRepositoryOutbound.of({
      findById,
      insert: Effect.fn('BookmarkRepository.insert')(function* (bookmark) {
        yield* checkUrlFree(bookmark);
        yield* save(bookmark);
      }),
      update: Effect.fn('BookmarkRepository.update')(function* (bookmark, expected) {
        const stored = yield* findById(bookmark.id);
        if (stored.version !== expected) {
          return yield* new VersionMismatchError({ id: bookmark.id, expected });
        }
        yield* checkUrlFree(bookmark);
        yield* save(bookmark);
      }),
      delete: Effect.fn('BookmarkRepository.delete')(function* (id, expected) {
        const stored = yield* findById(id);
        if (Option.isSome(expected) && stored.version !== expected.value) {
          return yield* new VersionMismatchError({ id, expected: expected.value });
        }
        yield* Ref.update(store, (bookmarks) => {
          const next = new Map(bookmarks);
          next.delete(id);
          return next;
        });
        return stored.version;
      }),
      list: Effect.fn('BookmarkRepository.list')(function* (query) {
        const matching = [...(yield* Ref.get(store)).values()]
          .filter((bookmark) => query.status === 'all' || bookmark.status === query.status)
          .filter((bookmark) => Option.isNone(query.tag) || bookmark.tags.includes(query.tag.value))
          .filter(
            (bookmark) =>
              Option.isNone(query.after) ||
              newestFirst(query.after.value, positionOf(bookmark)) < 0,
          )
          .sort((a, b) => newestFirst(positionOf(a), positionOf(b)));
        const items = matching.slice(0, query.limit);
        const last = items.at(-1);
        return {
          items,
          next:
            matching.length > query.limit && last !== undefined
              ? Option.some(positionOf(last))
              : Option.none(),
        };
      }),
    });
  }),
);
