import { describe, expect, it } from '@effect/vitest';
import * as Schema from 'effect/Schema';
import { OpenApi } from 'effect/http-api';
import { BookmarksApi, Cursor, MAX_TAGS } from './index.js';

const document = () => OpenApi.fromApi(BookmarksApi);

describe('BookmarksApi', () => {
  it('serves the bookmarks under /api/v1', () => {
    expect(Object.keys(document().paths)).toEqual(
      expect.arrayContaining(['/api/v1/bookmarks', '/api/v1/bookmarks/{id}']),
    );
  });

  it(`states the tag limit of ${MAX_TAGS} as maxItems`, () => {
    const schemas = document().components.schemas as Record<
      string,
      { properties?: Record<string, { maxItems?: number }> }
    >;
    const limits = Object.values(schemas).flatMap((schema) =>
      schema.properties?.['tags'] === undefined ? [] : [schema.properties['tags'].maxItems],
    );
    expect(limits.length).toBeGreaterThan(0);
    expect(new Set(limits)).toEqual(new Set([MAX_TAGS]));
  });

  it('describes the timestamps as strings with an example', () => {
    const bookmark = document().components.schemas['Bookmark'] as {
      properties: Record<string, { description?: string; examples?: Array<unknown> }>;
    };
    expect(bookmark.properties['createdAt']).toMatchObject({
      type: 'string',
      examples: ['2026-09-29T08:00:00.000Z'],
    });
  });

  it('answers create with 201, ETag and Location', () => {
    const created = document().paths['/api/v1/bookmarks']?.post?.responses?.['201'] as {
      headers?: object;
    };
    expect(Object.keys(created.headers ?? {})).toEqual(['etag', 'location']);
  });
});

describe('Cursor', () => {
  it('publishes an example that the API accepts', () => {
    const parameters = (document().paths['/api/v1/bookmarks']?.get?.parameters ?? []) as Array<{
      name: string;
      schema: { examples?: ReadonlyArray<string> };
    }>;
    const examples = parameters.find((parameter) => parameter.name === 'cursor')?.schema.examples;
    expect(examples?.length).toBeGreaterThan(0);
    for (const example of examples ?? []) {
      expect(() => Schema.decodeUnknownSync(Cursor)(example)).not.toThrow();
    }
  });
});

describe('the published document', () => {
  const doc = document();

  it('describes every parameter on the parameter itself', () => {
    for (const item of Object.values(doc.paths)) {
      for (const operation of Object.values(item as Record<string, { parameters?: unknown }>)) {
        for (const parameter of (operation.parameters ?? []) as Array<Record<string, unknown>>) {
          expect(parameter).toMatchObject({ description: expect.any(String) });
          expect(parameter['example']).toBeDefined();
        }
      }
    }
  });

  it('states the tag and the If-Match patterns', () => {
    const json = JSON.stringify(doc);
    expect(json).toContain('"pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$"');
    expect(json).toContain('"pattern":"^\\"[1-9][0-9]*\\"$"');
  });

  it('describes the URL with an example', () => {
    const bookmark = doc.components.schemas['Bookmark'] as {
      properties: Record<string, Record<string, unknown>>;
    };
    expect(bookmark.properties['url']).toMatchObject({
      description: expect.any(String),
      examples: ['https://effect.website/docs'],
    });
  });
});
