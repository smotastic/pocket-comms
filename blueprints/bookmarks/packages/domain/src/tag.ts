import * as Schema from 'effect/Schema';

export const MAX_TAG_LENGTH = 30;
/** The maximum number of tags per bookmark. */
export const MAX_TAGS = 10;
export const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const Tag = Schema.String.check(
  Schema.isBetweenLength(1, MAX_TAG_LENGTH),
  Schema.isPattern(TAG_PATTERN),
).pipe(Schema.brand('Tag'));
export type Tag = typeof Tag.Type;

export const Tags = Schema.Array(Tag).check(Schema.isMaxLength(MAX_TAGS), Schema.isUnique());
export type Tags = typeof Tags.Type;
