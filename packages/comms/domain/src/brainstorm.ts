import type { FieldIssue } from '@pocket-comms/backend-shared';
import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';

// The rules of the brainstorm chat: what the conversation holds, the issue or the edit
// a proposal drafts and how it is decided, the issues Pi read, and the project files Pi may read.

/** Gitea's limit of an issue title. */
export const MAX_ISSUE_TITLE = 255;
export const MAX_ISSUE_BODY = 20_000;

/** The issue a proposal drafts: the project by its name, the title and the Markdown body. */
export interface IssueDraft {
  readonly project: string;
  readonly title: string;
  readonly body: string;
}

/** An issue's title and its Markdown body: what an edit changes, and nothing else. */
export interface IssueText {
  readonly title: string;
  readonly body: string;
}

/** A proposal is open until the owner creates its issue or discards it, once. */
export type ProposalState =
  | { readonly _tag: 'open' }
  | { readonly _tag: 'created'; readonly number: number; readonly url: string }
  | { readonly _tag: 'discarded' };

/** An edit is open until the owner applies or discards it, once. */
export type EditState =
  | { readonly _tag: 'open' }
  | { readonly _tag: 'updated'; readonly url: string }
  | { readonly _tag: 'discarded' };

/** A new issue Pi proposes. */
export interface IssueProposal extends IssueDraft {
  readonly type: 'proposal';
  readonly kind: 'issue';
  readonly id: string;
  readonly at: number;
  readonly state: ProposalState;
}

/**
 * A new title and body Pi proposes for an existing issue. `base` is the issue as Pi read it, so
 * applying the edit can tell when someone changed the issue since.
 */
export interface EditProposal extends IssueText {
  readonly type: 'proposal';
  readonly kind: 'edit';
  readonly id: string;
  readonly at: number;
  readonly project: string;
  readonly number: number;
  /** The issue's page in Gitea. */
  readonly url: string;
  readonly base: IssueText;
  readonly state: EditState;
}

export type ProposalEntry = IssueProposal | EditProposal;

/** One entry of the brainstorm conversation. `at` is in epoch milliseconds. */
export type BrainstormEntry =
  | { readonly type: 'user'; readonly id: string; readonly at: number; readonly text: string }
  /** `text` is Markdown. */
  | { readonly type: 'assistant'; readonly id: string; readonly at: number; readonly text: string }
  | ProposalEntry
  /** A turn of Pi that failed, and why. */
  | { readonly type: 'failed'; readonly id: string; readonly at: number; readonly reason: string };

const textIssues = (title: string, body: string): Array<FieldIssue> => {
  const issues: Array<FieldIssue> = [];
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
  return issues;
};

/** The draft, trimmed; a blank project or title, or a field over its limit, is refused. */
export const parseIssueDraft = (
  draft: IssueDraft,
): Result.Result<IssueDraft, InvalidInputError> => {
  const project = draft.project.trim();
  const title = draft.title.trim();
  const body = draft.body.trim();
  const issues: Array<FieldIssue> = [
    ...(project === '' ? [{ field: 'project', message: 'Choose a project.' }] : []),
    ...textIssues(title, body),
  ];
  return issues.length === 0
    ? Result.succeed({ project, title, body })
    : Result.fail(new InvalidInputError({ issues }));
};

/**
 * The edit with its title trimmed; a blank title, or a field over its limit, is refused. The body
 * stays as written, so an edit that keeps it does not touch its whitespace.
 */
export const parseIssueEdit = (edit: IssueText): Result.Result<IssueText, InvalidInputError> => {
  const title = edit.title.trim();
  const issues = textIssues(title, edit.body);
  return issues.length === 0
    ? Result.succeed({ title, body: edit.body })
    : Result.fail(new InvalidInputError({ issues }));
};

/** The proposal with this id, if there is one. */
export const proposalOf = (
  entries: ReadonlyArray<BrainstormEntry>,
  id: string,
): ProposalEntry | undefined =>
  entries.find((entry): entry is ProposalEntry => entry.type === 'proposal' && entry.id === id);

/** The entries with the proposal of the same id replaced by its decided version. */
export const settleProposal = (
  entries: ReadonlyArray<BrainstormEntry>,
  decided: ProposalEntry,
): ReadonlyArray<BrainstormEntry> =>
  entries.map((entry) => (entry.type === 'proposal' && entry.id === decided.id ? decided : entry));

/** An issue as Pi last read it; `cut` when its body was longer than Pi may read. */
export interface IssueRead extends IssueText {
  readonly project: string;
  readonly number: number;
  /** The issue's page in Gitea. */
  readonly url: string;
  readonly cut: boolean;
}

/** The reads with this one as the last read of its issue. */
export const rememberRead = (
  reads: ReadonlyArray<IssueRead>,
  read: IssueRead,
): ReadonlyArray<IssueRead> => [
  ...reads.filter((kept) => kept.project !== read.project || kept.number !== read.number),
  read,
];

/** The last read of a project's issue, if Pi read it. */
export const readOf = (
  reads: ReadonlyArray<IssueRead>,
  project: string,
  number: number,
): IssueRead | undefined =>
  reads.find((read) => read.project === project && read.number === number);

/** The body Pi may read: at most an issue body's limit, and whether it was cut. */
export const cutIssueBody = (body: string): { readonly body: string; readonly cut: boolean } =>
  body.length <= MAX_ISSUE_BODY
    ? { body, cut: false }
    : { body: body.slice(0, MAX_ISSUE_BODY), cut: true };

/** Whether the issue's title or body differ from the base; its comments and labels do not count. */
export const baseChanged = (base: IssueText, current: IssueText): boolean =>
  base.title !== current.title || base.body !== current.body;

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
