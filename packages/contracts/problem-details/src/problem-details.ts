import * as Schema from 'effect/Schema';
import { HttpApiMiddleware, HttpApiSchema } from 'effect/http-api';

// RFC 9457 members. Every field carries a description and an example, because the published
// OpenAPI documents are linted for both.
const type = Schema.String.annotate({
  description: 'A URN that identifies the problem type. Clients branch on this value.',
  examples: ['urn:pocket-comms:problem:bookmark-not-found'],
});
const title = Schema.String.annotate({
  description: 'A short summary of the problem type. It is the same for every occurrence.',
  examples: ['Bookmark not found'],
});
const detail = Schema.optionalKey(
  Schema.String.annotate({
    description: 'An explanation of this occurrence of the problem.',
    examples: ['No bookmark has the id 0192f3a1-7b2c-7d3e-8f40-123456789abc.'],
  }),
);
const instance = Schema.optionalKey(
  Schema.String.annotate({
    description: 'A URI reference that identifies this occurrence of the problem.',
    examples: ['/api/v1/bookmarks/0192f3a1-7b2c-7d3e-8f40-123456789abc'],
  }),
);
const status = <S extends number>(code: S) =>
  Schema.Literal(code).annotate({
    description: 'The HTTP status code of this response.',
    examples: [code],
  });

/** Any RFC 9457 problem, for clients that handle problems generically. */
export const ProblemDetails = Schema.Struct({
  type,
  title,
  status: Schema.Int.annotate({ description: 'The HTTP status code.', examples: [404] }),
  detail,
  instance,
}).annotate({ identifier: 'ProblemDetails', description: 'An RFC 9457 problem.' });

export class NotFoundProblem extends Schema.Error<NotFoundProblem>('NotFoundProblem')(
  { type, title, status: status(404), detail, instance },
  { httpApiStatus: 404, description: 'The resource does not exist.' },
) {}

export class ConflictProblem extends Schema.Error<ConflictProblem>('ConflictProblem')(
  { type, title, status: status(409), detail, instance },
  {
    httpApiStatus: 409,
    description: 'The request conflicts with the current state of the resource.',
  },
) {}

export class PreconditionFailedProblem extends Schema.Error<PreconditionFailedProblem>(
  'PreconditionFailedProblem',
)(
  { type, title, status: status(412), detail, instance },
  { httpApiStatus: 412, description: 'The If-Match header does not match the current version.' },
) {}

export class PreconditionRequiredProblem extends Schema.Error<PreconditionRequiredProblem>(
  'PreconditionRequiredProblem',
)(
  { type, title, status: status(428), detail, instance },
  { httpApiStatus: 428, description: 'The request needs an If-Match header.' },
) {}

export const FieldError = Schema.Struct({
  field: Schema.String.annotate({
    description: 'The name of the failed field, header, query or path parameter.',
    examples: ['tags'],
  }),
  message: Schema.String.annotate({
    description: 'Why the value failed.',
    examples: ['Expected an array of at most 3 items'],
  }),
}).annotate({ identifier: 'FieldError', description: 'One failed input field.' });

export class ValidationProblem extends Schema.Error<ValidationProblem>('ValidationProblem')(
  {
    type,
    title,
    status: status(422),
    detail,
    instance,
    errors: Schema.Array(FieldError).annotate({
      description: 'Every failed field of the request.',
      examples: [[{ field: 'tags', message: 'Expected an array of at most 3 items' }]],
    }),
  },
  { httpApiStatus: 422, description: 'The request is invalid. `errors` names every failed field.' },
) {}

const asProblemJson = HttpApiSchema.asJson({ contentType: 'application/problem+json' });

/** The problem classes as endpoint error schemas, served as `application/problem+json`. */
export const Problems = {
  NotFound: NotFoundProblem.pipe(asProblemJson),
  Conflict: ConflictProblem.pipe(asProblemJson),
  PreconditionFailed: PreconditionFailedProblem.pipe(asProblemJson),
  PreconditionRequired: PreconditionRequiredProblem.pipe(asProblemJson),
  Validation: ValidationProblem.pipe(asProblemJson),
};

/**
 * Turns request-decoding failures into a `422` validation problem. Add it to every group that
 * takes input, and annotate the API with `HttpApi.ParseOptions` `{ errors: 'all' }` so the problem
 * names every failed field, and with `HttpApi.PayloadParseOptions`
 * `{ errors: 'all', onExcessProperty: 'error' }` so an undeclared body field fails too (ADR 0005);
 * `@pocket-comms/backend-shared/http` provides its server layer.
 */
export class ValidationMiddleware extends HttpApiMiddleware.Service<ValidationMiddleware>()(
  'app/contracts/problem-details/ValidationMiddleware',
  { error: Problems.Validation },
) {}
