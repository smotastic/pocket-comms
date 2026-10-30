import * as Data from 'effect/Data';

// Failures that the outbound ports report. Domain rule failures live in the domain.

export class BookmarkNotFoundError extends Data.TaggedError('BookmarkNotFoundError')<{
  readonly id: string;
}> {}

export class UrlAlreadyUsedError extends Data.TaggedError('UrlAlreadyUsedError')<{
  readonly url: string;
}> {}

export class VersionMismatchError extends Data.TaggedError('VersionMismatchError')<{
  readonly id: string;
  readonly expected: number;
}> {}
