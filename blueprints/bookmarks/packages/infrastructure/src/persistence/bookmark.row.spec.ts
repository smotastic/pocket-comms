import { describe, expect, it } from '@effect/vitest';
import { BookmarkId, createBookmark, type Bookmark } from '@pocket-comms/bookmarks-domain';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as Result from 'effect/Result';
import { fromBookmark, toBookmark } from './index.js';

const bookmark: Bookmark = Result.getOrThrow(
  createBookmark({
    id: BookmarkId.make('0192f3a1-7b2c-7d3e-8f40-123456789abc'),
    input: { url: 'https://effect.website', title: 'Effect', tags: ['docs'] },
    now: DateTime.makeUnsafe('2026-09-29T08:00:00.123Z'),
  }),
);

const row = {
  id: '0192f3a1-7b2c-7d3e-8f40-123456789abc',
  url: 'https://effect.website',
  title: 'Effect',
  tags: ['docs'],
  status: 'active',
  version: 1,
  created_at: new Date('2026-09-29T08:00:00.123Z'),
  updated_at: new Date('2026-09-29T08:00:00.123Z'),
};

describe('bookmark rows', () => {
  it('maps a bookmark to the column values of its row', () => {
    expect(fromBookmark(bookmark)).toEqual(row);
  });

  it.effect('maps a row back to the same bookmark', () =>
    Effect.gen(function* () {
      expect(yield* toBookmark(row)).toEqual(bookmark);
    }),
  );

  it.effect('fails for a row that breaks a domain rule', () =>
    Effect.gen(function* () {
      const error = yield* toBookmark({ ...row, url: 'ftp://x' }).pipe(Effect.flip);
      expect(error._tag).toBe('SchemaError');
    }),
  );
});
