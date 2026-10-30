import * as Schema from 'effect/Schema';

export const BookmarkId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('BookmarkId'));
export type BookmarkId = typeof BookmarkId.Type;
