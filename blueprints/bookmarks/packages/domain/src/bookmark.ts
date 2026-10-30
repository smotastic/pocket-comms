import type { FieldIssue } from '@pocket-comms/backend-shared';
import type * as DateTime from 'effect/DateTime';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import { BookmarkId } from './bookmark-id.js';
import { BookmarkStatus } from './bookmark-status.js';
import { BookmarkUrl } from './bookmark-url.js';
import { BookmarkArchivedError, InvalidBookmarkError } from './errors.js';
import { Tags } from './tag.js';
import { Title } from './title.js';
import { initialVersion, nextVersion, Version } from './version.js';

export const Bookmark = Schema.Struct({
  id: BookmarkId,
  url: BookmarkUrl,
  title: Title,
  tags: Tags,
  status: BookmarkStatus,
  version: Version,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
});
export type Bookmark = typeof Bookmark.Type;

interface BookmarkDraft {
  readonly url: BookmarkUrl;
  readonly title: Title;
  readonly tags: Tags;
}

export interface BookmarkInput {
  readonly url: string;
  readonly title: string;
  readonly tags: ReadonlyArray<string>;
}

const fields = {
  url: (value: string) => Schema.decodeUnknownResult(BookmarkUrl)(value),
  title: (value: string) => Schema.decodeUnknownResult(Title)(value.trim()),
  tags: (value: ReadonlyArray<string>) => Schema.decodeUnknownResult(Tags)(value),
};

type Parsed<I extends Partial<BookmarkInput>> = {
  -readonly [K in keyof I & keyof BookmarkDraft]: BookmarkDraft[K];
};

// Each field is decoded on its own, so one failed field never hides another.
const parseFields = <I extends Partial<BookmarkInput>>(
  input: I,
): Result.Result<Parsed<I>, InvalidBookmarkError> => {
  const parsed: Record<string, unknown> = {};
  const issues: Array<FieldIssue> = [];
  for (const field of ['url', 'title', 'tags'] as const) {
    const value = input[field];
    if (value === undefined) continue;
    const result = (
      fields[field] as (value: unknown) => Result.Result<unknown, Schema.SchemaError>
    )(value);
    if (Result.isSuccess(result)) parsed[field] = result.success;
    else issues.push({ field, message: result.failure.message });
  }
  return issues.length === 0
    ? Result.succeed(parsed as Parsed<I>)
    : Result.fail(new InvalidBookmarkError({ issues }));
};

export const createBookmark = (params: {
  readonly id: BookmarkId;
  readonly input: BookmarkInput;
  readonly now: DateTime.Utc;
}): Result.Result<Bookmark, InvalidBookmarkError> =>
  Result.map(parseFields(params.input), (draft) => ({
    ...draft,
    id: params.id,
    status: 'active' as const,
    version: initialVersion,
    createdAt: params.now,
    updatedAt: params.now,
  }));

const sameTags = (a: Tags, b: Tags) => a.length === b.length && a.every((tag, i) => tag === b[i]);

/**
 * Invalid input fails before an archived bookmark does, and a change that changes nothing
 * returns the same value, without a new version.
 */
export const changeBookmark = (params: {
  readonly bookmark: Bookmark;
  readonly input: Partial<BookmarkInput>;
  readonly now: DateTime.Utc;
}): Result.Result<Bookmark, InvalidBookmarkError | BookmarkArchivedError> =>
  Result.flatMap(
    parseFields(params.input),
    (
      changes: Partial<BookmarkDraft>,
    ): Result.Result<Bookmark, InvalidBookmarkError | BookmarkArchivedError> => {
      const { bookmark } = params;
      if (bookmark.status === 'archived') {
        return Result.fail(new BookmarkArchivedError({ id: bookmark.id }));
      }
      const changed = { ...bookmark, ...changes };
      if (
        changed.url === bookmark.url &&
        changed.title === bookmark.title &&
        sameTags(changed.tags, bookmark.tags)
      ) {
        return Result.succeed(bookmark);
      }
      return Result.succeed({
        ...changed,
        version: nextVersion(bookmark.version),
        updatedAt: params.now,
      });
    },
  );

/** Archiving is idempotent: an archived bookmark comes back as the same value. */
export const archiveBookmark = (params: {
  readonly bookmark: Bookmark;
  readonly now: DateTime.Utc;
}): Bookmark =>
  params.bookmark.status === 'archived'
    ? params.bookmark
    : {
        ...params.bookmark,
        status: 'archived',
        version: nextVersion(params.bookmark.version),
        updatedAt: params.now,
      };
