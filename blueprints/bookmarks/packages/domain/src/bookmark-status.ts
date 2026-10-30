import * as Schema from 'effect/Schema';

export const BookmarkStatus = Schema.Literals(['active', 'archived']);
export type BookmarkStatus = typeof BookmarkStatus.Type;
