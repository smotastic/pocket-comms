import { describe, expect, it } from '@effect/vitest';
import { InvalidBookmarkError, MAX_TAGS } from '@pocket-comms/bookmarks-domain';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { TestClock } from 'effect/testing';
import { UrlAlreadyUsedError } from '../errors.js';
import { BookmarksInbound } from '../ports/bookmark.inbound.port.js';
import { FakeState, fakeIds, fakeLayer } from '../testing/fakes.js';

const now = DateTime.makeUnsafe('2026-09-29T08:00:00Z');
const input = { url: 'https://effect.website/docs', title: ' Effect docs ', tags: ['docs'] };

const run = <A, E>(effect: Effect.Effect<A, E, BookmarksInbound | FakeState>) =>
  effect.pipe(Effect.provide(BookmarksInbound.layer.pipe(Layer.provideMerge(fakeLayer()))));

const create = (value = input) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(DateTime.toEpochMillis(now));
    const useCase = yield* BookmarksInbound;
    return yield* useCase.create(value);
  });

const failedFields = (error: unknown) =>
  error instanceof InvalidBookmarkError ? error.issues.map((issue) => issue.field) : [];

describe('BookmarksInbound.create', () => {
  it.effect('stores a new bookmark at version 1 and returns it', () =>
    run(
      Effect.gen(function* () {
        const created = yield* create();
        expect(created).toEqual({
          id: fakeIds[0],
          url: 'https://effect.website/docs',
          title: 'Effect docs',
          tags: ['docs'],
          status: 'active',
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        const state = yield* FakeState;
        expect(state.bookmarks.get(created.id)).toMatchObject({ id: created.id, version: 1 });
      }),
    ),
  );

  it.effect('rejects invalid input, naming every failed field, and stores nothing', () =>
    run(
      Effect.gen(function* () {
        const error = yield* create({ url: '/docs', title: ' ', tags: [] }).pipe(Effect.flip);
        expect(error).toBeInstanceOf(InvalidBookmarkError);
        expect(failedFields(error)).toEqual(['url', 'title']);
        const state = yield* FakeState;
        expect(state.bookmarks.size).toBe(0);
      }),
    ),
  );

  it.effect('names too many tags next to the other failed fields', () =>
    run(
      Effect.gen(function* () {
        const tags = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `tag-${i}`);
        const error = yield* create({ ...input, url: '/x', tags }).pipe(Effect.flip);
        expect(failedFields(error)).toEqual(['url', 'tags']);
      }),
    ),
  );

  it.effect('rejects a URL that another bookmark uses and stores nothing more', () =>
    run(
      Effect.gen(function* () {
        yield* create();
        const error = yield* create({ ...input, title: 'Again' }).pipe(Effect.flip);
        expect(error).toEqual(new UrlAlreadyUsedError({ url: input.url }));
        const state = yield* FakeState;
        expect(state.bookmarks.size).toBe(1);
      }),
    ),
  );
});
