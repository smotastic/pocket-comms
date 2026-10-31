import type { FieldIssue } from '@pocket-comms/backend-shared';
import * as Data from 'effect/Data';

/** Input that breaks a rule of what the app sends to an agent. `issues` names every failed field. */
export class InvalidInputError extends Data.TaggedError('InvalidInputError')<{
  readonly issues: ReadonlyArray<FieldIssue>;
}> {}
