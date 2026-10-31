import { Problems, ValidationMiddleware } from '@pocket-comms/contracts-problem-details';
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import { HttpRouter, HttpServer } from 'effect/http';
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import {
  conflictProblem,
  forbiddenProblem,
  notFoundProblem,
  preconditionFailedProblem,
  preconditionRequiredProblem,
  problemType,
  serviceUnavailableProblem,
  validationMiddlewareLayer,
  validationProblem,
} from './index.js';

const Api = HttpApi.make('example')
  .add(
    HttpApiGroup.make('things')
      .add(
        HttpApiEndpoint.post('create', '/things', {
          payload: Schema.Struct({
            count: Schema.Int,
            name: Schema.String,
            labels: Schema.optionalKey(Schema.Array(Schema.String)),
          }),
          success: Schema.Struct({ count: Schema.Int }),
          error: [Problems.NotFound, Problems.Validation],
        }),
        HttpApiEndpoint.get('get', '/things/:id', {
          params: { id: Schema.String.check(Schema.isUUID()) },
          query: { limit: Schema.optionalKey(Schema.NumberFromString.check(Schema.isInt())) },
          headers: {
            'if-match': Schema.optionalKey(Schema.String.check(Schema.isStartingWith('"'))),
          },
          success: Schema.Struct({ count: Schema.Int }),
          error: Problems.Validation,
        }),
      )
      .middleware(ValidationMiddleware),
  )
  .annotate(HttpApi.ParseOptions, { errors: 'all' });

const handlers = HttpApiBuilder.group(Api, 'things', (h) =>
  Effect.succeed(
    h
      .handle('create', ({ payload }) =>
        payload.count === 0
          ? Effect.fail(notFoundProblem({ slug: 'thing-not-found', title: 'Thing not found' }))
          : // A negative count stands for a handler bug: half a thing breaks the Int response schema.
            Effect.succeed({ count: payload.count < 0 ? 0.5 : payload.count }),
      )
      .handle('get', () => Effect.succeed({ count: 1 })),
  ),
);

const { handler, dispose } = HttpRouter.toWebHandler(
  HttpApiBuilder.layer(Api).pipe(
    Layer.provide(handlers),
    Layer.provide(validationMiddlewareLayer),
    Layer.provide(HttpServer.layerServices),
  ),
  { disableLogger: true },
);

const send = async (request: Request) => {
  const response = await handler(request);
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    body: response.headers.get('content-type')?.includes('json') ? await response.json() : null,
  };
};

const post = (body: unknown) =>
  send(
    new Request('http://localhost/things', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const uuid = '0192f3a1-7b2c-7d3e-8f40-123456789abc';

const fields = (body: { errors: ReadonlyArray<{ field: string }> }) =>
  body.errors.map((error) => error.field);

describe('validationMiddlewareLayer', () => {
  it('answers a request that fails to decode with a 422 problem naming every failed field', async () => {
    const response = await post({ count: 'many' });
    expect(response.status).toBe(422);
    expect(response.contentType).toBe('application/problem+json');
    expect(response.body).toMatchObject({
      type: 'urn:pocket-comms:problem:invalid-request',
      title: 'The request is invalid',
      status: 422,
    });
    expect(fields(response.body)).toEqual(['count', 'name']);
  });

  it('names the top-level field of a nested failure and keeps the path in the message', async () => {
    const response = await post({ count: 1, name: 'x', labels: ['ok', 7] });
    expect(response.body.errors).toEqual([{ field: 'labels', message: 'Expected string at 1' }]);
  });

  it('names the body when the body is not JSON', async () => {
    const response = await post('{not json');
    expect(response.status).toBe(422);
    expect(fields(response.body)).toEqual(['body']);
  });

  // The framework decodes the path, the headers, the query and the body one after another and stops
  // at the first part that fails, so each part is checked on its own.
  it.each([
    ['a path parameter', 'http://localhost/things/42', {}, 'id'],
    ['a query parameter', `http://localhost/things/${uuid}?limit=many`, {}, 'limit'],
    ['a header', `http://localhost/things/${uuid}`, { 'if-match': 'W/1' }, 'if-match'],
  ])('names a failed %s', async (_, url, headers, field) => {
    const response = await send(new Request(url, { headers }));
    expect(response.status).toBe(422);
    expect(fields(response.body)).toEqual([field]);
  });

  it('keeps a typed error from the handler', async () => {
    const response = await post({ count: 0, name: 'zero' });
    expect(response).toEqual({
      status: 404,
      contentType: 'application/problem+json',
      body: {
        type: 'urn:pocket-comms:problem:thing-not-found',
        title: 'Thing not found',
        status: 404,
      },
    });
  });

  it('does not report a failure to encode the response as invalid input', async () => {
    const response = await post({ count: -1, name: 'negative' });
    // The framework's own answer to a response it cannot encode.
    expect(response.status).toBe(400);
    expect(response.contentType).not.toBe('application/problem+json');
  });
});

describe('problem constructors', () => {
  it('build the problem type as a stable URN', () => {
    expect(problemType('bookmark-not-found')).toBe('urn:pocket-comms:problem:bookmark-not-found');
  });

  it.each([
    [notFoundProblem, 404],
    [conflictProblem, 409],
    [preconditionFailedProblem, 412],
    [preconditionRequiredProblem, 428],
    [forbiddenProblem, 403],
    [serviceUnavailableProblem, 503],
  ] as const)('set the status of each problem (%#)', (make, status) => {
    expect(make({ slug: 'example', title: 'Example', detail: 'Why' })).toMatchObject({
      type: 'urn:pocket-comms:problem:example',
      title: 'Example',
      status,
      detail: 'Why',
    });
  });

  it('map field issues to a validation problem', () => {
    const problem = validationProblem([{ field: 'tags', message: 'Too many tags' }]);
    expect(problem).toMatchObject({
      type: 'urn:pocket-comms:problem:invalid-request',
      status: 422,
      errors: [{ field: 'tags', message: 'Too many tags' }],
    });
  });
});

process.on('beforeExit', () => void dispose());
