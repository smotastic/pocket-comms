import {
  ConflictProblem,
  ForbiddenProblem,
  NotFoundProblem,
  PreconditionFailedProblem,
  PreconditionRequiredProblem,
  ServiceUnavailableProblem,
  ValidationMiddleware,
  ValidationProblem,
} from '@pocket-comms/contracts-problem-details';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as SchemaIssue from 'effect/SchemaIssue';
import { HttpApiError } from 'effect/http-api';
import type { FieldIssue } from '../field-issue.js';

/** Problem types are stable URNs; clients branch on them, so a slug never changes meaning. */
export const problemType = (slug: string) => `urn:pocket-comms:problem:${slug}`;

export interface ProblemInput {
  /** The kebab-case name of the problem type, for example `bookmark-not-found`. */
  readonly slug: string;
  readonly title: string;
  readonly detail?: string;
}

const members = ({ slug, title, detail }: ProblemInput) => ({
  type: problemType(slug),
  title,
  ...(detail === undefined ? {} : { detail }),
});

export const notFoundProblem = (input: ProblemInput) =>
  new NotFoundProblem({ ...members(input), status: 404 });

export const conflictProblem = (input: ProblemInput) =>
  new ConflictProblem({ ...members(input), status: 409 });

export const preconditionFailedProblem = (input: ProblemInput) =>
  new PreconditionFailedProblem({ ...members(input), status: 412 });

export const preconditionRequiredProblem = (input: ProblemInput) =>
  new PreconditionRequiredProblem({ ...members(input), status: 428 });

export const forbiddenProblem = (input: ProblemInput) =>
  new ForbiddenProblem({ ...members(input), status: 403 });

export const serviceUnavailableProblem = (input: ProblemInput) =>
  new ServiceUnavailableProblem({ ...members(input), status: 503 });

export const validationProblem = (
  issues: ReadonlyArray<FieldIssue>,
  input: ProblemInput = { slug: 'invalid-request', title: 'The request is invalid' },
) => new ValidationProblem({ ...members(input), status: 422, errors: issues });

const formatter = SchemaIssue.makeFormatterStandardSchemaV1();

// The name reported when a whole part fails, for example a body that is not JSON.
const partNames: Partial<Record<HttpApiError.HttpApiSchemaError['kind'], string>> = {
  Params: 'path',
  Headers: 'headers',
  Query: 'query',
  Payload: 'body',
};

// The top-level key is the field the caller sent: a body member, a query or path parameter, or a
// header. Deeper path segments stay in the message.
const toFieldIssues = (part: string, issue: SchemaIssue.Issue): ReadonlyArray<FieldIssue> =>
  formatter(issue).issues.map((item) => {
    const [field, ...rest] = (item.path ?? []).map((segment) =>
      typeof segment === 'object' ? segment.key : segment,
    );
    const at = rest.length === 0 ? '' : ` at ${rest.map(String).join('.')}`;
    return { field: field === undefined ? part : String(field), message: `${item.message}${at}` };
  });

const requestPart = (error: unknown): string | undefined =>
  HttpApiError.HttpApiSchemaError.is(error) ? partNames[error.kind] : undefined;

/**
 * Serves `ValidationMiddleware`: a request that fails to decode becomes one `422` problem. A
 * response that fails to encode is a server bug and keeps the framework's handling. The problem
 * names every failed field only when the API sets `HttpApi.ParseOptions` to `{ errors: 'all' }`.
 */
export const validationMiddlewareLayer = Layer.succeed(ValidationMiddleware, (httpEffect) =>
  Effect.mapError(httpEffect, (error) => {
    const failure: unknown = error;
    const part = requestPart(failure);
    return part === undefined || !HttpApiError.HttpApiSchemaError.is(failure)
      ? error
      : validationProblem(toFieldIssues(part, failure.cause.issue));
  }),
);
