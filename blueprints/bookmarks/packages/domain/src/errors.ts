import type { FieldIssue } from '@pocket-comms/backend-shared';
import * as Data from 'effect/Data';
import type { BookmarkId } from './bookmark-id.js';

/** Input that breaks a value-object rule. `issues` names every failed field. */
export class InvalidBookmarkError extends Data.TaggedError('InvalidBookmarkError')<{
  readonly issues: ReadonlyArray<FieldIssue>;
}> {}

export class BookmarkArchivedError extends Data.TaggedError('BookmarkArchivedError')<{
  readonly id: BookmarkId;
}> {}
