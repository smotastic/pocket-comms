import type { FieldIssue } from '@pocket-comms/backend-shared';
import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';

// The rules of the brainstorm chat (spec 013): what the conversation holds, the issue a proposal
// drafts and how it is decided, and the project files Pi may read.

/** Gitea's limit of an issue title. */
export const MAX_ISSUE_TITLE = 255;
export const MAX_ISSUE_BODY = 20_000;

/** The issue a proposal drafts: the project by its name, the title and the Markdown body. */
export interface IssueDraft {
  readonly project: string;
  readonly title: string;
  readonly body: string;
}

/** A proposal is open until the owner creates its issue or discards it, once. */
export type ProposalState =
  | { readonly _tag: 'open' }
  | { readonly _tag: 'created'; readonly number: number; readonly url: string }
  | { readonly _tag: 'discarded' };

export interface ProposalEntry extends IssueDraft {
  readonly type: 'proposal';
  readonly id: string;
  readonly at: number;
  readonly state: ProposalState;
}

/** One entry of the brainstorm conversation. `at` is in epoch milliseconds. */
export type BrainstormEntry =
  | { readonly type: 'user'; readonly id: string; readonly at: number; readonly text: string }
  /** `text` is Markdown. */
  | { readonly type: 'assistant'; readonly id: string; readonly at: number; readonly text: string }
  | ProposalEntry
  /** A turn of Pi that failed, and why. */
  | { readonly type: 'failed'; readonly id: string; readonly at: number; readonly reason: string };

/** The draft, trimmed; a blank project or title, or a field over its limit, is refused. */
export const parseIssueDraft = (
  draft: IssueDraft,
): Result.Result<IssueDraft, InvalidInputError> => {
  const project = draft.project.trim();
  const title = draft.title.trim();
  const body = draft.body.trim();
  const issues: Array<FieldIssue> = [];
  if (project === '') issues.push({ field: 'project', message: 'Choose a project.' });
  if (title === '') issues.push({ field: 'title', message: 'Give the issue a title.' });
  else if (title.length > MAX_ISSUE_TITLE) {
    issues.push({
      field: 'title',
      message: `The title is longer than ${MAX_ISSUE_TITLE} characters.`,
    });
  }
  if (body.length > MAX_ISSUE_BODY) {
    issues.push({
      field: 'body',
      message: `The body is longer than ${MAX_ISSUE_BODY} characters.`,
    });
  }
  return issues.length === 0
    ? Result.succeed({ project, title, body })
    : Result.fail(new InvalidInputError({ issues }));
};

/** The proposal with this id, if there is one. */
export const proposalOf = (
  entries: ReadonlyArray<BrainstormEntry>,
  id: string,
): ProposalEntry | undefined =>
  entries.find((entry): entry is ProposalEntry => entry.type === 'proposal' && entry.id === id);

/** The entries with the proposal `id` decided: it keeps the draft the owner decided on. */
export const settleProposal = (
  entries: ReadonlyArray<BrainstormEntry>,
  id: string,
  draft: IssueDraft,
  state: ProposalState,
): ReadonlyArray<BrainstormEntry> =>
  entries.map((entry) =>
    entry.type === 'proposal' && entry.id === id ? { ...entry, ...draft, state } : entry,
  );

/** The files at a project's top level that Pi may read; nothing else. */
export const PROJECT_DOCS = ['README.md', 'AGENTS.md'] as const;
export type ProjectDoc = (typeof PROJECT_DOCS)[number];

export const isProjectDoc = (name: string): name is ProjectDoc =>
  (PROJECT_DOCS as ReadonlyArray<string>).includes(name);

/** Pi reads at most this many characters of a project doc. */
export const MAX_DOC_LENGTH = 20_000;

export const cutDoc = (text: string): string =>
  text.length <= MAX_DOC_LENGTH
    ? text
    : `${text.slice(0, MAX_DOC_LENGTH)}\n\n[cut: the file is longer]`;
