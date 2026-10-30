import type { ListPosition } from '@pocket-comms/bookmarks-application';
import type { Bookmark } from '@pocket-comms/bookmarks-domain';
import * as DateTime from 'effect/DateTime';

/** Newest first; bookmarks created in the same instant follow their id, highest first. */
export const newestFirst = (a: ListPosition, b: ListPosition): number => {
  const byTime = DateTime.toEpochMillis(b.createdAt) - DateTime.toEpochMillis(a.createdAt);
  if (byTime !== 0) return byTime;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
};

export const positionOf = (bookmark: Bookmark): ListPosition => ({
  createdAt: bookmark.createdAt,
  id: bookmark.id,
});
