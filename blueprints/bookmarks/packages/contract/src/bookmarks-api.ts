import { Problems, ValidationMiddleware } from '@pocket-comms/contracts-problem-details';
import * as Schema from 'effect/Schema';
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from 'effect/http-api';

// Wire schemas of the bookmarks API v1. They repeat every value-object rule of the service, so the
// published document states them and one decoding pass names every failed field; the service
// still checks each rule itself. Every field carries a description and an example, because the
// published documents are linted for both.

export const BookmarkIdParam = Schema.String.check(Schema.isUUID()).annotate({
  description: 'The id of the bookmark.',
  examples: ['0192f3a1-7b2c-7d3e-8f40-123456789abc'],
});

const isAbsoluteHttpUrl = (value: string) =>
  URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol);

// In this Effect release a custom filter must come first, or it drops the annotations, and a
// pattern reaches the document only with the `u` flag.
const Url = Schema.String.check(
  Schema.makeFilter((value: string) =>
    isAbsoluteHttpUrl(value) ? undefined : 'Expected an absolute http or https URL',
  ),
  Schema.isMaxLength(2048),
  Schema.isPattern(/^[hH][tT][tT][pP][sS]?:\/\//u),
).annotate({
  description: 'An absolute http or https URL of at most 2,048 characters.',
  examples: ['https://effect.website/docs'],
});

const Title = Schema.Trim.pipe(
  Schema.decodeTo(Schema.Trimmed.check(Schema.isBetweenLength(1, 200))),
  Schema.annotateEncoded({
    description: 'The title, 1 to 200 characters after trimming leading and trailing white space.',
    examples: ['Effect documentation'],
  }),
);

const Tag = Schema.String.check(
  Schema.isBetweenLength(1, 30),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
).annotate({
  description: 'A lowercase kebab-case tag of 1 to 30 characters.',
  examples: ['docs'],
});

/** The maximum number of tags per bookmark; the domain enforces the same limit. */
export const MAX_TAGS = 10;

const Tags = Schema.Array(Tag)
  .check(Schema.isMaxLength(MAX_TAGS), Schema.isUnique())
  .annotate({
    description: `The unique tags of the bookmark, at most ${MAX_TAGS}.`,
    examples: [['docs', 'effect']],
  });

const Status = Schema.Literals(['active', 'archived']).annotate({
  description: 'An archived bookmark can no longer be changed.',
  examples: ['active'],
});

// The annotation belongs to the encoded side, because the document describes the string.
const Timestamp = Schema.DateTimeUtcFromString.pipe(
  Schema.annotateEncoded({
    description: 'An RFC 3339 timestamp in UTC.',
    examples: ['2026-09-29T08:00:00.000Z'],
  }),
);

export const Bookmark = Schema.Struct({
  id: BookmarkIdParam,
  url: Url,
  title: Title,
  tags: Tags,
  status: Status,
  version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
    description: 'Starts at 1 and increases by 1 with every change. The ETag carries it.',
    examples: [1],
  }),
  createdAt: Timestamp,
  updatedAt: Timestamp,
}).annotate({ identifier: 'Bookmark', description: 'A stored bookmark.' });

export const CreateBookmarkRequest = Schema.Struct({ url: Url, title: Title, tags: Tags }).annotate(
  {
    identifier: 'CreateBookmarkRequest',
    description: 'A new bookmark.',
  },
);

const ListPosition = Schema.Struct({
  createdAt: Schema.DateTimeUtcFromString,
  id: Schema.String.check(Schema.isUUID()),
});

/** An opaque position in the list: base64url JSON of the last bookmark's creation time and id. */
export const Cursor = Schema.StringFromBase64Url.pipe(
  Schema.decodeTo(Schema.fromJsonString(ListPosition)),
  Schema.annotateEncoded({
    description: 'An opaque cursor from `next` of the previous page. Do not build it yourself.',
    examples: [
      'eyJjcmVhdGVkQXQiOiIyMDI2LTA5LTI5VDA4OjAwOjAwLjAwMFoiLCJpZCI6IjAxOTJmM2ExLTdiMmMtN2QzZS04ZjQwLTEyMzQ1Njc4OWFiYyJ9',
    ],
  }),
);

const listQuery = {
  tag: Schema.optionalKey(
    Tag.annotate({ description: 'Returns only the bookmarks with this tag.', examples: ['docs'] }),
  ),
  status: Schema.optionalKey(
    Schema.Literals(['active', 'archived', 'all']).annotate({
      description: 'Returns the bookmarks with this status; `active` when missing.',
      examples: ['active'],
    }),
  ),
  cursor: Schema.optionalKey(Cursor),
  limit: Schema.optionalKey(
    Schema.NumberFromString.check(
      Schema.isInt(),
      Schema.isBetween({ minimum: 1, maximum: 100 }),
    ).pipe(
      Schema.annotateEncoded({
        description: 'The page size, 1 to 100; 20 when missing.',
        examples: ['20'],
      }),
    ),
  ),
};

export const UpdateBookmarkRequest = Schema.Struct({
  url: Schema.optionalKey(Url),
  title: Schema.optionalKey(Title),
  tags: Schema.optionalKey(Tags),
}).annotate({
  identifier: 'UpdateBookmarkRequest',
  description: 'The fields to change; a missing field keeps its value.',
});

/** One strong entity tag, as the `ETag` of a bookmark carries it. */
export const IfMatch = Schema.String.check(Schema.isPattern(/^"[1-9][0-9]*"$/u)).annotate({
  description:
    'The ETag of the version the change is based on. Another current version fails with 412.',
  examples: ['"1"'],
});

export const ETag = Schema.String.annotate({
  description: 'The version of the returned bookmark as a strong entity tag.',
  examples: ['"1"'],
});

const Location = Schema.String.annotate({
  description: 'The path of the created bookmark.',
  examples: ['/api/v1/bookmarks/0192f3a1-7b2c-7d3e-8f40-123456789abc'],
});

const withETag = HttpApiSchema.WithHeaders(Bookmark, { etag: ETag });

const group = HttpApiGroup.make('bookmarks')
  .add(
    HttpApiEndpoint.post('create', '/bookmarks', {
      payload: CreateBookmarkRequest,
      success: HttpApiSchema.WithHeaders(Bookmark, { etag: ETag, location: Location }).pipe(
        HttpApiSchema.status(201),
      ),
      error: [Problems.Conflict, Problems.Validation],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Create a bookmark',
        description: 'Creates a bookmark at version 1. A URL can belong to one bookmark only.',
      }),
    ),
    HttpApiEndpoint.get('list', '/bookmarks', {
      query: listQuery,
      success: Schema.Struct({
        items: Schema.Array(Bookmark).annotate({
          description: 'The bookmarks of this page, newest first.',
          examples: [[]],
        }),
        next: Schema.optionalKey(Cursor),
      }).annotate({ identifier: 'BookmarkPage', description: 'One page of bookmarks.' }),
      error: Problems.Validation,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'List bookmarks',
        description:
          'Lists bookmarks newest first, by tag and status, in pages. `next` is present when more bookmarks follow.',
      }),
    ),
    HttpApiEndpoint.patch('update', '/bookmarks/:id', {
      params: { id: BookmarkIdParam },
      headers: { 'if-match': Schema.optionalKey(IfMatch) },
      payload: UpdateBookmarkRequest,
      success: withETag,
      error: [
        Problems.NotFound,
        Problems.Conflict,
        Problems.PreconditionFailed,
        Problems.PreconditionRequired,
        Problems.Validation,
      ],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Change a bookmark',
        description:
          'Changes the URL, the title or the tags. Requires If-Match (428 without it). An archived bookmark cannot change (409).',
      }),
    ),
    HttpApiEndpoint.post('archive', '/bookmarks/:id/archive', {
      params: { id: BookmarkIdParam },
      headers: { 'if-match': Schema.optionalKey(IfMatch) },
      success: withETag,
      error: [Problems.NotFound, Problems.PreconditionFailed, Problems.Validation],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Archive a bookmark',
        description:
          'Archives a bookmark. An archived bookmark comes back unchanged. If-Match is optional.',
      }),
    ),
    HttpApiEndpoint.delete('delete', '/bookmarks/:id', {
      params: { id: BookmarkIdParam },
      headers: { 'if-match': Schema.optionalKey(IfMatch) },
      success: HttpApiSchema.NoContent,
      error: [Problems.NotFound, Problems.PreconditionFailed, Problems.Validation],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Delete a bookmark',
        description: 'Deletes a bookmark for good, also an archived one. If-Match is optional.',
      }),
    ),
    HttpApiEndpoint.get('get', '/bookmarks/:id', {
      params: { id: BookmarkIdParam },
      success: withETag,
      error: [Problems.NotFound, Problems.Validation],
    }).annotateMerge(
      OpenApi.annotations({ summary: 'Get a bookmark', description: 'Returns one bookmark.' }),
    ),
  )
  .middleware(ValidationMiddleware)
  .prefix('/api/v1')
  .annotateMerge(
    OpenApi.annotations({
      title: 'Bookmarks',
      description: 'Create, read and change bookmarks.',
    }),
  );

/** The bookmarks API v1, shared by the server and the web app. */
export const BookmarksApi = HttpApi.make('bookmarks')
  .add(group)
  .annotate(HttpApi.ParseOptions, { errors: 'all' })
  // A body field the contract does not declare fails instead of being dropped, as the published
  // `additionalProperties: false` promises. A slot annotation replaces `ParseOptions`, so it
  // repeats `errors`. Headers keep the default: they include undeclared transport headers.
  .annotate(HttpApi.PayloadParseOptions, { errors: 'all', onExcessProperty: 'error' })
  .annotateMerge(
    OpenApi.annotations({
      title: 'Bookmarks API',
      version: '1',
      description: 'The reference service of the template: bookmarks with tags and versions.',
      transform: (spec) => liftParameterDocs(spec),
    }),
  );

export type BookmarksApi = typeof BookmarksApi;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Effect writes a parameter's description and examples into its schema only; OpenAPI tools show
 * the ones on the parameter itself, so the document carries them there as well.
 */
export const liftParameterDocs = (spec: Record<string, unknown>): Record<string, unknown> => {
  const paths = isRecord(spec['paths']) ? spec['paths'] : {};
  for (const item of Object.values(paths)) {
    if (!isRecord(item)) continue;
    for (const operation of Object.values(item)) {
      const parameters = isRecord(operation) ? operation['parameters'] : undefined;
      if (!Array.isArray(parameters)) continue;
      for (const parameter of parameters) {
        if (!isRecord(parameter) || !isRecord(parameter['schema'])) continue;
        const { description, examples } = parameter['schema'];
        if (parameter['description'] === undefined && typeof description === 'string') {
          parameter['description'] = description;
        }
        if (parameter['example'] === undefined && Array.isArray(examples)) {
          parameter['example'] = examples[0];
        }
      }
    }
  }
  return spec;
};
