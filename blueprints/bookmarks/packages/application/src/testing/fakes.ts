import { BookmarkId, type Bookmark } from '@pocket-comms/bookmarks-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { BookmarkNotFoundError, UrlAlreadyUsedError, VersionMismatchError } from '../errors.js';
import {
  BookmarkRepositoryOutbound,
  IdGeneratorOutbound,
  type ListQuery,
} from '../ports/bookmark.outbound.port.js';

/**
 * Minimal fakes of the outbound ports for use-case tests. They keep only what a use case can
 * observe; the real ordering and paging rules are tested with the infrastructure adapters.
 */
export class FakeState extends Context.Service<
  FakeState,
  {
    readonly bookmarks: Map<string, Bookmark>;
    readonly queries: Array<ListQuery>;
  }
>()('bookmarks/application/testing/FakeState') {}

export const fakeIds = [
  BookmarkId.make('0192f3a1-7b2c-7d3e-8f40-000000000001'),
  BookmarkId.make('0192f3a1-7b2c-7d3e-8f40-000000000002'),
  BookmarkId.make('0192f3a1-7b2c-7d3e-8f40-000000000003'),
];

const repository = (state: FakeState['Service']) => {
  const find = (id: string) =>
    Option.fromNullishOr(state.bookmarks.get(id)).pipe(
      Effect.fromOption,
      Effect.mapError(() => new BookmarkNotFoundError({ id })),
    );
  const urlTaken = (bookmark: Bookmark) =>
    [...state.bookmarks.values()].some((b) => b.url === bookmark.url && b.id !== bookmark.id);
  return BookmarkRepositoryOutbound.of({
    findById: find,
    insert: Effect.fnUntraced(function* (bookmark) {
      if (urlTaken(bookmark)) return yield* new UrlAlreadyUsedError({ url: bookmark.url });
      state.bookmarks.set(bookmark.id, bookmark);
    }),
    update: Effect.fnUntraced(function* (bookmark, expected) {
      const stored = yield* find(bookmark.id);
      if (stored.version !== expected) {
        return yield* new VersionMismatchError({ id: bookmark.id, expected });
      }
      if (urlTaken(bookmark)) return yield* new UrlAlreadyUsedError({ url: bookmark.url });
      state.bookmarks.set(bookmark.id, bookmark);
    }),
    delete: Effect.fnUntraced(function* (id, expected) {
      const stored = yield* find(id);
      if (Option.isSome(expected) && stored.version !== expected.value) {
        return yield* new VersionMismatchError({ id, expected: expected.value });
      }
      state.bookmarks.delete(id);
      return stored.version;
    }),
    list: (query) =>
      Effect.sync(() => {
        state.queries.push(query);
        return { items: [...state.bookmarks.values()], next: Option.none() };
      }),
  });
};

export const fakeLayer = () => {
  const state = Layer.sync(FakeState, () => ({ bookmarks: new Map(), queries: [] }));
  const ports = Layer.effectContext(
    Effect.gen(function* () {
      const fake = yield* FakeState;
      let issued = 0;
      return Context.make(BookmarkRepositoryOutbound, repository(fake)).pipe(
        Context.add(IdGeneratorOutbound, {
          next: Effect.suspend(() => {
            const id = fakeIds[issued++ % fakeIds.length];
            return id === undefined ? Effect.die(new Error('No fake id left')) : Effect.succeed(id);
          }),
        }),
      );
    }),
  );
  return Layer.provideMerge(ports, state);
};
