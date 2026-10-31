import { describe, expect, it } from '@effect/vitest';
import * as Schema from 'effect/Schema';
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';
import {
  ConflictProblem,
  ForbiddenProblem,
  NotFoundProblem,
  PreconditionFailedProblem,
  PreconditionRequiredProblem,
  ProblemDetails,
  Problems,
  ServiceUnavailableProblem,
  ValidationMiddleware,
  ValidationProblem,
} from './index.js';

const base = { type: 'urn:pocket-comms:problem:example', title: 'Example' };

describe('problem classes', () => {
  const expected = (status: number) => ({ ...base, status, detail: 'Why it failed' });

  it('encode an RFC 9457 body for 404', () => {
    const problem = new NotFoundProblem({ ...base, status: 404, detail: 'Why it failed' });
    expect(Schema.encodeSync(NotFoundProblem)(problem)).toEqual(expected(404));
  });

  it('encode an RFC 9457 body for 409', () => {
    const problem = new ConflictProblem({ ...base, status: 409, detail: 'Why it failed' });
    expect(Schema.encodeSync(ConflictProblem)(problem)).toEqual(expected(409));
  });

  it('encode an RFC 9457 body for 412', () => {
    const problem = new PreconditionFailedProblem({
      ...base,
      status: 412,
      detail: 'Why it failed',
    });
    expect(Schema.encodeSync(PreconditionFailedProblem)(problem)).toEqual(expected(412));
  });

  it('encode an RFC 9457 body for 428', () => {
    const problem = new PreconditionRequiredProblem({
      ...base,
      status: 428,
      detail: 'Why it failed',
    });
    expect(Schema.encodeSync(PreconditionRequiredProblem)(problem)).toEqual(expected(428));
  });

  it('encode an RFC 9457 body for 403', () => {
    const problem = new ForbiddenProblem({ ...base, status: 403, detail: 'Why it failed' });
    expect(Schema.encodeSync(ForbiddenProblem)(problem)).toEqual(expected(403));
  });

  it('encode an RFC 9457 body for 503', () => {
    const problem = new ServiceUnavailableProblem({
      ...base,
      status: 503,
      detail: 'Why it failed',
    });
    expect(Schema.encodeSync(ServiceUnavailableProblem)(problem)).toEqual(expected(503));
  });

  it('encode a validation problem with every failed field', () => {
    const problem = new ValidationProblem({
      ...base,
      status: 422,
      errors: [{ field: 'url', message: 'Expected an absolute http or https URL' }],
    });
    expect(Schema.encodeSync(ValidationProblem)(problem)).toEqual({
      ...base,
      status: 422,
      errors: [{ field: 'url', message: 'Expected an absolute http or https URL' }],
    });
  });

  it('decode every problem body as ProblemDetails', () => {
    const body = { ...base, status: 404, instance: '/api/v1/things/1' };
    expect(Schema.decodeUnknownSync(ProblemDetails)(body)).toEqual(body);
  });
});

describe('Problems', () => {
  const api = HttpApi.make('example').add(
    HttpApiGroup.make('things')
      .add(
        HttpApiEndpoint.post('create', '/things', {
          payload: Schema.Struct({ name: Schema.String }),
          success: Schema.Struct({ name: Schema.String }),
          error: [Problems.NotFound, Problems.Conflict, Problems.PreconditionFailed],
        }),
      )
      .middleware(ValidationMiddleware),
  );
  const responses: Record<string, { content?: object }> =
    OpenApi.fromApi(api).paths['/things']?.post?.responses ?? {};

  it.each(['404', '409', '412', '422'])(
    'publish the %s response as application/problem+json',
    (status) => {
      expect(Object.keys(responses[status]?.content ?? {})).toEqual(['application/problem+json']);
    },
  );
});
