import * as Schema from 'effect/Schema';

export const MAX_URL_LENGTH = 2048;

const HTTP_PREFIX = /^https?:\/\//i;

const isAbsoluteHttpUrl = (value: string) => {
  if (!HTTP_PREFIX.test(value) || !URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === 'http:' || protocol === 'https:';
};

export const BookmarkUrl = Schema.String.check(
  Schema.isMaxLength(MAX_URL_LENGTH),
  Schema.makeFilter((value: string) =>
    isAbsoluteHttpUrl(value) ? undefined : 'Expected an absolute http or https URL',
  ),
).pipe(Schema.brand('BookmarkUrl'));
export type BookmarkUrl = typeof BookmarkUrl.Type;
