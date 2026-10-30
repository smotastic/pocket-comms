import { describe, expect, it } from '@effect/vitest';
import { InvalidBookmarkError } from '@pocket-comms/bookmarks-domain';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { BookmarksInbound } from '../ports/bookmark.inbound.port.js';
import { FakeState, fakeLayer } from '../testing/fakes.js';

const layer = BookmarksInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const list = (query: Parameters<BookmarksInbound['Service']['list']>[0]) =>
  BookmarksInbound.use((inbound) => inbound.list(query));

const failedFields = (error: unknown) =>
  error instanceof InvalidBookmarkError ? error.issues.map((issue) => issue.field) : [];

describe('BookmarksInbound.list', () => {
  it.effect('returns the page of the repository as DTOs', () =>
    Effect.gen(function* () {
      const created = yield* BookmarksInbound.use((inbound) =>
        inbound.create({ url: 'https://effect.website', title: 'Effect', tags: ['docs'] }),
      );
      const page = yield* list({ status: 'active', limit: 20 });
      expect(page).toEqual({ items: [created], next: Option.none() });
    }).pipe(Effect.provide(layer)),
  );

  it.effect('passes the tag, the status, the position and the limit to the repository', () =>
    Effect.gen(function* () {
      const after = {
        createdAt: DateTime.makeUnsafe('2026-09-29T08:00:00Z'),
        id: '0192f3a1-7b2c-7d3e-8f40-000000000001',
      };
      yield* list({ tag: 'docs', status: 'archived', after, limit: 5 });
      const { queries } = yield* FakeState;
      expect(queries).toEqual([
        { tag: Option.some('docs'), status: 'archived', after: Option.some(after), limit: 5 },
      ]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect('rejects an invalid tag as invalid input naming tag', () =>
    Effect.gen(function* () {
      const error = yield* list({ tag: 'Not A Tag', status: 'active', limit: 20 }).pipe(
        Effect.flip,
      );
      expect(error).toBeInstanceOf(InvalidBookmarkError);
      expect(failedFields(error)).toEqual(['tag']);
    }).pipe(Effect.provide(layer)),
  );
});
