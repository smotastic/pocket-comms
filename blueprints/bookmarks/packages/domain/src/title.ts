import * as Schema from 'effect/Schema';

export const MAX_TITLE_LENGTH = 200;

/** A title is stored trimmed; parse input with `Title` after trimming it. */
export const Title = Schema.Trimmed.check(Schema.isBetweenLength(1, MAX_TITLE_LENGTH)).pipe(
  Schema.brand('Title'),
);
export type Title = typeof Title.Type;
