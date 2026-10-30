import { describe, expect, it } from '@effect/vitest';
import { bookmarksApiLayer, bookmarksHandlersLayer } from '@pocket-comms/bookmarks-api';
import { BookmarksApi, MAX_TAGS } from '@pocket-comms/bookmarks-contract';
import {
  ConflictProblem,
  NotFoundProblem,
  PreconditionFailedProblem,
  PreconditionRequiredProblem,
} from '@pocket-comms/contracts-problem-details';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type * as Scope from 'effect/Scope';
import { HttpRouter, HttpServer } from 'effect/http';
import { HttpApiTest } from 'effect/http-api';
import { TestClock } from 'effect/testing';
import { inMemoryServices } from './composition.js';

const unknownId = '0192f3a1-7b2c-7d3e-8f40-0000000000ff';

const tags = (count: number) => Array.from({ length: count }, (_, i) => `tag-${i + 1}`);

interface WireResponse {
  readonly status: number;
  readonly contentType: string | null;
  readonly body: { readonly type?: string; readonly errors?: ReadonlyArray<{ field: string }> };
}

// The acceptance criteria of the bookmarks API, driven through a client derived from the
// contract. Every test starts with an empty in-memory store.
describe('bookmarks API', () => {
  const layer = bookmarksHandlersLayer.pipe(
    Layer.provideMerge(inMemoryServices),
    Layer.provideMerge(HttpServer.layerServices),
  );
  const test = (
    title: string,
    body: Effect.Effect<void, unknown, Layer.Success<typeof layer> | Scope.Scope>,
  ) => it.effect(title, () => Effect.provide(Effect.scoped(body), layer));
  const client = HttpApiTest.groups(BookmarksApi, ['bookmarks']);

  // The typed client refuses to encode invalid input, so invalid requests go over the wire as
  // raw HTTP. Each call serves a fresh deployable.
  const send = (path: string, init: RequestInit) =>
    Effect.promise(async (): Promise<WireResponse> => {
      const { handler, dispose } = HttpRouter.toWebHandler(
        bookmarksApiLayer.pipe(
          Layer.provide(inMemoryServices),
          Layer.provide(HttpServer.layerServices),
        ),
        { disableLogger: true },
      );
      try {
        const response = await handler(new Request(`http://localhost${path}`, init));
        return {
          status: response.status,
          contentType: response.headers.get('content-type'),
          body: response.headers.get('content-type')?.includes('json') ? await response.json() : {},
        };
      } finally {
        await dispose();
      }
    });
  const post = (body: unknown) =>
    send('/api/v1/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  // A field that breaks two rules is named once per rule.
  const wireFields = (response: WireResponse) =>
    [...new Set((response.body.errors ?? []).map((issue) => issue.field))].sort();
  const input = {
    url: 'https://effect.website/docs',
    title: 'Effect docs',
    tags: ['docs', 'effect'],
  };

  test(
    'creates a bookmark with 201, version 1, an ETag and a Location',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const created = yield* bookmarks.create({ payload: input });
      expect(created.body).toMatchObject({ ...input, status: 'active', version: 1 });
      expect(created.headers).toEqual({
        etag: '"1"',
        location: `/api/v1/bookmarks/${created.body.id}`,
      });
    }),
  );

  test(
    'rejects a second bookmark with the same URL as a 409 problem',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      yield* bookmarks.create({ payload: input });
      const error = yield* bookmarks
        .create({ payload: { ...input, title: 'Again' } })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(ConflictProblem);
      expect(error).toMatchObject({
        type: 'urn:pocket-comms:problem:bookmark-url-already-used',
        status: 409,
      });
    }),
  );

  test(
    `accepts ${MAX_TAGS} tags`,
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const created = yield* bookmarks.create({
        payload: { ...input, tags: tags(MAX_TAGS) },
      });
      expect(created.body.tags).toHaveLength(MAX_TAGS);
    }),
  );

  test(
    `rejects ${MAX_TAGS + 1} tags as a 422 problem naming tags`,
    Effect.gen(function* () {
      const response = yield* post({ ...input, tags: tags(MAX_TAGS + 1) });
      expect(response.status).toBe(422);
      expect(response.contentType).toBe('application/problem+json');
      expect(wireFields(response)).toEqual(['tags']);
    }),
  );

  test(
    'rejects invalid input as a 422 problem naming every failed field',
    Effect.gen(function* () {
      const response = yield* post({ url: '/docs', title: '   ', tags: ['Docs'] });
      expect(response).toMatchObject({
        status: 422,
        contentType: 'application/problem+json',
        body: { type: 'urn:pocket-comms:problem:invalid-request' },
      });
      expect(wireFields(response)).toEqual(['tags', 'title', 'url']);
    }),
  );

  test(
    'rejects a body field the contract does not declare as a 422 problem naming it',
    Effect.gen(function* () {
      const response = yield* post({ ...input, titel: 'typo' });
      expect(response).toMatchObject({ status: 422, contentType: 'application/problem+json' });
      expect(wireFields(response)).toEqual(['titel']);
    }),
  );

  // Decoding comes before the lookup, so the unknown id is never reached.
  test(
    'rejects a patch with an undeclared body field as a 422 problem, not as a no-op',
    Effect.gen(function* () {
      const response = yield* send(`/api/v1/bookmarks/${unknownId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'if-match': '"1"' },
        body: JSON.stringify({ titel: 'typo' }),
      });
      expect(response).toMatchObject({ status: 422, contentType: 'application/problem+json' });
      expect(wireFields(response)).toEqual(['titel']);
    }),
  );

  test(
    'gets a bookmark with its ETag',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const created = yield* bookmarks.create({ payload: input });
      const found = yield* bookmarks.get({ params: { id: created.body.id } });
      expect(found).toMatchObject({ body: created.body, headers: { etag: '"1"' } });
    }),
  );

  // 25 active bookmarks, one second apart; every fifth has the tag `docs`.
  const createTwentyFive = Effect.gen(function* () {
    const { bookmarks } = yield* client;
    const created = [];
    for (let n = 1; n <= 25; n++) {
      yield* TestClock.adjust('1 second');
      const bookmark = yield* bookmarks.create({
        payload: {
          url: `https://example.com/${n}`,
          title: `Bookmark ${n}`,
          tags: n % 5 === 0 ? ['docs'] : [],
        },
      });
      created.push(bookmark.body);
    }
    return created.reverse();
  });

  test(
    'lists the bookmarks with a tag, newest first',
    Effect.gen(function* () {
      const newestFirst = yield* createTwentyFive;
      const { bookmarks } = yield* client;
      const page = yield* bookmarks.list({ query: { tag: 'docs' } });
      expect(page.items.map((bookmark) => bookmark.title)).toEqual(
        newestFirst.filter((bookmark) => bookmark.tags.includes('docs')).map((b) => b.title),
      );
      expect(page.items).toHaveLength(5);
      expect(page.next).toBeUndefined();
    }),
  );

  test(
    'pages with limit and cursor',
    Effect.gen(function* () {
      const newestFirst = yield* createTwentyFive;
      const { bookmarks } = yield* client;
      const first = yield* bookmarks.list({ query: { limit: 10 } });
      expect(first.items).toEqual(newestFirst.slice(0, 10));
      expect(first.next).toBeDefined();
      const second = yield* bookmarks.list({ query: { limit: 10, cursor: first.next } });
      expect(second.items).toEqual(newestFirst.slice(10, 20));
      const last = yield* bookmarks.list({ query: { limit: 10, cursor: second.next } });
      expect(last.items).toEqual(newestFirst.slice(20));
      expect(last.next).toBeUndefined();
    }),
  );

  test(
    'lists 20 bookmarks by default',
    Effect.gen(function* () {
      yield* createTwentyFive;
      const { bookmarks } = yield* client;
      expect((yield* bookmarks.list({ query: {} })).items).toHaveLength(20);
    }),
  );

  test(
    'rejects a limit above 100 and a cursor that does not decode as 422 problems',
    Effect.gen(function* () {
      const tooMany = yield* send('/api/v1/bookmarks?limit=101', {});
      expect(tooMany.status).toBe(422);
      expect(wireFields(tooMany)).toEqual(['limit']);
      const forged = yield* send('/api/v1/bookmarks?cursor=not-a-cursor', {});
      expect(forged.status).toBe(422);
      expect(wireFields(forged)).toEqual(['cursor']);
    }),
  );

  test(
    'updates a bookmark with If-Match and returns the new ETag',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const created = yield* bookmarks.create({ payload: input });
      const updated = yield* bookmarks.update({
        params: { id: created.body.id },
        headers: { 'if-match': '"1"' },
        payload: { title: 'New title', tags: ['docs'] },
      });
      expect(updated.body).toMatchObject({ title: 'New title', tags: ['docs'], version: 2 });
      expect(updated.headers).toMatchObject({ etag: '"2"' });
    }),
  );

  test(
    'rejects a patch with the If-Match of an older version as 412 and changes nothing',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const created = yield* bookmarks.create({ payload: input });
      const id = created.body.id;
      yield* bookmarks.update({
        params: { id },
        headers: { 'if-match': '"1"' },
        payload: { title: 'Second' },
      });
      const error = yield* bookmarks
        .update({ params: { id }, headers: { 'if-match': '"1"' }, payload: { title: 'Stale' } })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(PreconditionFailedProblem);
      expect(error).toMatchObject({ status: 412 });
      const found = yield* bookmarks.get({ params: { id } });
      expect(found.body).toMatchObject({ title: 'Second', version: 2 });
    }),
  );

  test(
    'rejects a patch without If-Match as 428',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const created = yield* bookmarks.create({ payload: input });
      const error = yield* bookmarks
        .update({ params: { id: created.body.id }, headers: {}, payload: { title: 'New' } })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(PreconditionRequiredProblem);
      expect(error).toMatchObject({ status: 428 });
    }),
  );

  test(
    'rejects an If-Match that is not one strong entity tag as a 422 problem',
    Effect.gen(function* () {
      const response = yield* send(`/api/v1/bookmarks/${unknownId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'if-match': 'W/"1"' },
        body: JSON.stringify({ title: 'New' }),
      });
      expect(response.status).toBe(422);
      expect(wireFields(response)).toEqual(['if-match']);
    }),
  );

  test(
    'answers a patch of an unknown id with a 404 problem',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const error = yield* bookmarks
        .update({ params: { id: unknownId }, headers: { 'if-match': '"1"' }, payload: {} })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(NotFoundProblem);
    }),
  );

  test(
    'archives a bookmark; a second archive changes nothing',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const created = yield* bookmarks.create({ payload: input });
      const id = created.body.id;
      const archived = yield* bookmarks.archive({ params: { id }, headers: {} });
      expect(archived.body).toMatchObject({ status: 'archived', version: 2 });
      expect(archived.headers).toMatchObject({ etag: '"2"' });
      const again = yield* bookmarks.archive({ params: { id }, headers: {} });
      expect(again.body).toEqual(archived.body);
    }),
  );

  test(
    'rejects a patch of an archived bookmark as a 409 problem',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const created = yield* bookmarks.create({ payload: input });
      const id = created.body.id;
      yield* bookmarks.archive({ params: { id }, headers: {} });
      const error = yield* bookmarks
        .update({ params: { id }, headers: { 'if-match': '"2"' }, payload: { title: 'New' } })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(ConflictProblem);
      expect(error).toMatchObject({ type: 'urn:pocket-comms:problem:bookmark-archived' });
    }),
  );

  test(
    'checks an optional If-Match on archive',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const created = yield* bookmarks.create({ payload: input });
      const error = yield* bookmarks
        .archive({ params: { id: created.body.id }, headers: { 'if-match': '"7"' } })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(PreconditionFailedProblem);
      const archived = yield* bookmarks.archive({
        params: { id: created.body.id },
        headers: { 'if-match': '"1"' },
      });
      expect(archived.body.version).toBe(2);
    }),
  );

  test(
    'lists archived bookmarks only on request',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const active = yield* bookmarks.create({ payload: input });
      yield* TestClock.adjust('1 second');
      const other = yield* bookmarks.create({
        payload: { ...input, url: 'https://example.com/other' },
      });
      yield* bookmarks.archive({ params: { id: other.body.id }, headers: {} });
      const titles = (page: { items: ReadonlyArray<{ id: string }> }) =>
        page.items.map((b) => b.id);
      expect(titles(yield* bookmarks.list({ query: {} }))).toEqual([active.body.id]);
      expect(titles(yield* bookmarks.list({ query: { status: 'archived' } }))).toEqual([
        other.body.id,
      ]);
      expect(titles(yield* bookmarks.list({ query: { status: 'all' } }))).toEqual([
        other.body.id,
        active.body.id,
      ]);
    }),
  );

  test(
    'answers an archive of an unknown id with a 404 problem',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const error = yield* bookmarks
        .archive({ params: { id: unknownId }, headers: {} })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(NotFoundProblem);
    }),
  );

  test(
    'deletes a bookmark with 204',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const created = yield* bookmarks.create({ payload: input });
      const id = created.body.id;
      yield* bookmarks.delete({ params: { id }, headers: {} });
      const error = yield* bookmarks.get({ params: { id } }).pipe(Effect.flip);
      expect(error).toBeInstanceOf(NotFoundProblem);
    }),
  );

  test(
    'deletes an archived bookmark',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const created = yield* bookmarks.create({ payload: input });
      const id = created.body.id;
      yield* bookmarks.archive({ params: { id }, headers: {} });
      yield* bookmarks.delete({ params: { id }, headers: { 'if-match': '"2"' } });
      expect(yield* bookmarks.get({ params: { id } }).pipe(Effect.flip)).toBeInstanceOf(
        NotFoundProblem,
      );
    }),
  );

  test(
    'rejects a delete with the If-Match of an older version as 412 and keeps the bookmark',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const created = yield* bookmarks.create({ payload: input });
      const id = created.body.id;
      const error = yield* bookmarks
        .delete({ params: { id }, headers: { 'if-match': '"2"' } })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(PreconditionFailedProblem);
      expect((yield* bookmarks.get({ params: { id } })).body.id).toBe(id);
    }),
  );

  test(
    'answers a delete of an unknown id with a 404 problem',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const error = yield* bookmarks
        .delete({ params: { id: unknownId }, headers: {} })
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(NotFoundProblem);
    }),
  );

  test(
    'answers an unknown id with a 404 problem',
    Effect.gen(function* () {
      const { bookmarks } = yield* client;
      const error = yield* bookmarks.get({ params: { id: unknownId } }).pipe(Effect.flip);
      expect(error).toBeInstanceOf(NotFoundProblem);
      expect(error).toMatchObject({
        type: 'urn:pocket-comms:problem:bookmark-not-found',
        status: 404,
      });
    }),
  );
});
