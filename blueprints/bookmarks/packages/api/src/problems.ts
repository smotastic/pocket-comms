import {
  conflictProblem,
  notFoundProblem,
  preconditionFailedProblem,
  preconditionRequiredProblem,
  validationProblem,
} from '@pocket-comms/backend-shared/http';
import type { FieldIssue } from '@pocket-comms/backend-shared';
import * as Effect from 'effect/Effect';

// One Problem Details response per tagged error of the use cases. The `type` URNs are part of
// the public contract: clients branch on them, so a slug never changes meaning.

export const problems = {
  invalidBookmark: (error: { readonly issues: ReadonlyArray<FieldIssue> }) =>
    Effect.fail(validationProblem(error.issues)),
  urlAlreadyUsed: (error: { readonly url: string }) =>
    Effect.fail(
      conflictProblem({
        slug: 'bookmark-url-already-used',
        title: 'The URL belongs to another bookmark',
        detail: `Another bookmark already has the URL ${error.url}.`,
      }),
    ),
  bookmarkNotFound: (error: { readonly id: string }) =>
    Effect.fail(
      notFoundProblem({
        slug: 'bookmark-not-found',
        title: 'Bookmark not found',
        detail: `No bookmark has the id ${error.id}.`,
      }),
    ),
  bookmarkArchived: (error: { readonly id: string }) =>
    Effect.fail(
      conflictProblem({
        slug: 'bookmark-archived',
        title: 'The bookmark is archived',
        detail: `The bookmark ${error.id} is archived and cannot change.`,
      }),
    ),
  versionMismatch: (error: { readonly id: string; readonly expected: number }) =>
    Effect.fail(
      preconditionFailedProblem({
        slug: 'bookmark-version-mismatch',
        title: 'The bookmark has another version',
        detail: `The bookmark ${error.id} is no longer at version ${error.expected}.`,
      }),
    ),
  ifMatchRequired: () =>
    Effect.fail(
      preconditionRequiredProblem({
        slug: 'if-match-required',
        title: 'The request needs an If-Match header',
        detail: 'Send the ETag of the version the change is based on.',
      }),
    ),
};
