import { describe, expect, it } from '@effect/vitest';
import * as DateTime from 'effect/DateTime';
import * as Result from 'effect/Result';
import {
  archiveBookmark,
  BookmarkArchivedError,
  BookmarkId,
  changeBookmark,
  createBookmark,
  InvalidBookmarkError,
  MAX_TAGS,
  type Bookmark,
  type BookmarkInput,
} from './index.js';

const id = BookmarkId.make('0192f3a1-7b2c-7d3e-8f40-123456789abc');
const createdAt = DateTime.makeUnsafe('2026-09-29T08:00:00Z');
const later = DateTime.makeUnsafe('2026-09-29T09:00:00Z');
const tags = (count: number) => Array.from({ length: count }, (_, i) => `tag-${i + 1}`);

const create = (input: Partial<BookmarkInput> = {}) =>
  createBookmark({
    id,
    input: {
      url: input.url ?? 'https://effect.website/docs',
      title: input.title ?? 'Effect docs',
      tags: input.tags ?? ['docs', 'effect'],
    },
    now: createdAt,
  });

const created = (): Bookmark => Result.getOrThrow(create());

const change = (bookmark: Bookmark, input: Partial<BookmarkInput>) =>
  changeBookmark({ bookmark, input, now: later });

const failedFields = (result: Result.Result<unknown, unknown>) =>
  Result.isFailure(result) && result.failure instanceof InvalidBookmarkError
    ? result.failure.issues.map((issue) => issue.field)
    : [];

describe('createBookmark', () => {
  it('creates an active bookmark at version 1', () => {
    const bookmark = created();
    expect(bookmark).toEqual({
      id,
      url: 'https://effect.website/docs',
      title: 'Effect docs',
      tags: ['docs', 'effect'],
      status: 'active',
      version: 1,
      createdAt,
      updatedAt: createdAt,
    });
  });

  it('trims the title', () => {
    expect(Result.getOrThrow(create({ title: '  Effect docs  ' })).title).toBe('Effect docs');
  });

  it.each([
    '/docs/intro',
    'ftp://example.com/file',
    'not a url',
    'https:example.com',
    ' https://a.example',
  ])('rejects the URL "%s"', (url) => {
    expect(failedFields(create({ url }))).toEqual(['url']);
  });

  it('accepts an absolute http URL', () => {
    expect(Result.isSuccess(create({ url: 'http://example.com/page' }))).toBe(true);
  });

  it('rejects a URL longer than 2,048 characters', () => {
    const url = `https://example.com/${'a'.repeat(2048)}`;
    expect(failedFields(create({ url }))).toEqual(['url']);
  });

  it('accepts a URL of exactly 2,048 characters', () => {
    const prefix = 'https://example.com/';
    const url = `${prefix}${'a'.repeat(2048 - prefix.length)}`;
    expect(Result.isSuccess(create({ url }))).toBe(true);
  });

  it('rejects a title that is blank after trimming', () => {
    expect(failedFields(create({ title: '   ' }))).toEqual(['title']);
  });

  it('accepts a title of exactly 200 characters', () => {
    expect(Result.isSuccess(create({ title: 'a'.repeat(200) }))).toBe(true);
  });

  it('rejects a title longer than 200 characters', () => {
    expect(failedFields(create({ title: 'a'.repeat(201) }))).toEqual(['title']);
  });

  it.each(['Docs', 'two words', 'trailing-', '-leading', 'double--dash', 'a'.repeat(31), ''])(
    'rejects the tag "%s"',
    (tag) => {
      expect(failedFields(create({ tags: [tag] }))).toEqual(['tags']);
    },
  );

  it('accepts a tag of exactly 30 characters', () => {
    expect(Result.isSuccess(create({ tags: ['a'.repeat(30)] }))).toBe(true);
  });

  it('rejects duplicate tags', () => {
    expect(failedFields(create({ tags: ['docs', 'docs'] }))).toEqual(['tags']);
  });

  it('names every failed field', () => {
    expect(failedFields(create({ url: '/x', title: '', tags: ['A'] }))).toEqual([
      'url',
      'title',
      'tags',
    ]);
  });

  it(`accepts exactly ${MAX_TAGS} tags`, () => {
    expect(Result.isSuccess(create({ tags: tags(MAX_TAGS) }))).toBe(true);
  });

  it(`rejects more than ${MAX_TAGS} tags as a tags issue`, () => {
    expect(failedFields(create({ tags: tags(MAX_TAGS + 1) }))).toEqual(['tags']);
  });

  it('names too many tags next to the other failed fields', () => {
    expect(failedFields(create({ url: '/x', tags: tags(MAX_TAGS + 1) }))).toEqual(['url', 'tags']);
  });
});

describe('changeBookmark', () => {
  it('applies the changes and increments the version', () => {
    const changed = Result.getOrThrow(change(created(), { title: 'New title', tags: [] }));
    expect(changed).toMatchObject({ title: 'New title', tags: [], version: 2 });
    expect(changed.url).toBe('https://effect.website/docs');
    expect(changed.createdAt).toEqual(createdAt);
    expect(changed.updatedAt).toEqual(later);
  });

  it('changes only the URL', () => {
    const changed = Result.getOrThrow(change(created(), { url: 'https://example.com/new' }));
    expect(changed).toMatchObject({
      url: 'https://example.com/new',
      title: 'Effect docs',
      tags: ['docs', 'effect'],
      version: 2,
    });
  });

  it('trims the title', () => {
    expect(Result.getOrThrow(change(created(), { title: ' New ' })).title).toBe('New');
  });

  it.each([
    {},
    { title: 'Effect docs' },
    { title: ' Effect docs ' },
    { url: 'https://effect.website/docs', tags: ['docs', 'effect'] },
  ])('returns the same bookmark for changes that change nothing: %j', (input) => {
    const bookmark = created();
    expect(Result.getOrThrow(change(bookmark, input))).toBe(bookmark);
  });

  it('names every failed field', () => {
    expect(failedFields(change(created(), { url: 'x', tags: ['A'] }))).toEqual(['url', 'tags']);
  });

  it(`rejects more than ${MAX_TAGS} tags as a tags issue`, () => {
    expect(failedFields(change(created(), { tags: tags(MAX_TAGS + 1) }))).toEqual(['tags']);
  });

  it('rejects a change of an archived bookmark', () => {
    const archived = archiveBookmark({ bookmark: created(), now: later });
    expect(change(archived, { title: 'New title' })).toEqual(
      Result.fail(new BookmarkArchivedError({ id })),
    );
  });

  it('rejects an empty change of an archived bookmark', () => {
    const archived = archiveBookmark({ bookmark: created(), now: later });
    expect(change(archived, {})).toEqual(Result.fail(new BookmarkArchivedError({ id })));
  });

  it('reports invalid input before an archived bookmark', () => {
    const archived = archiveBookmark({ bookmark: created(), now: later });
    expect(failedFields(change(archived, { title: ' ' }))).toEqual(['title']);
  });
});

describe('archiveBookmark', () => {
  it('archives an active bookmark and increments the version', () => {
    const archived = archiveBookmark({ bookmark: created(), now: later });
    expect(archived).toMatchObject({ status: 'archived', version: 2 });
    expect(archived.updatedAt).toEqual(later);
  });

  it('returns an archived bookmark unchanged', () => {
    const archived = archiveBookmark({ bookmark: created(), now: later });
    const again = archiveBookmark({
      bookmark: archived,
      now: DateTime.makeUnsafe('2026-09-30T00:00:00Z'),
    });
    expect(again).toBe(archived);
  });
});

describe('value objects', () => {
  it('rejects a bookmark id that is not a UUID', () => {
    expect(() => BookmarkId.make('42')).toThrow();
  });
});
