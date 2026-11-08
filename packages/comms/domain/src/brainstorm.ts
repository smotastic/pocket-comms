import type { FieldIssue } from '@pocket-comms/backend-shared';
import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';

// The rules of the brainstorm chat: what the conversation holds, the issue or the edit
// a proposal drafts and how it is decided, the pictures that go with it, the issues Pi read, and
// the project files Pi may read.

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

/**
 * A proposal is open until the owner creates its issue or discards it, once. It is `attaching`
 * while the issue exists but its pictures are not all attached (spec 023).
 */
export type ProposalState =
  | { readonly _tag: 'open' }
  | { readonly _tag: 'created'; readonly number: number; readonly url: string }
  | { readonly _tag: 'discarded' }
  | { readonly _tag: 'attaching'; readonly number: number; readonly url: string };

/** A chat picture that is an attachment of the issue in Gitea, and its link there. */
export interface AttachedPicture {
  readonly image: string;
  readonly url: string;
}

/**
 * The chat pictures that go with a proposal, by image id: the ones Pi named, then the owner's
 * choice. `attached` are those already in Gitea, so a retry never uploads one twice.
 */
interface WithPictures {
  readonly pictures: ReadonlyArray<string>;
  readonly attached: ReadonlyArray<AttachedPicture>;
}

/** An edit is open until the owner applies or discards it, once. */
export type EditState =
  | { readonly _tag: 'open' }
  | { readonly _tag: 'updated'; readonly url: string }
  | { readonly _tag: 'discarded' };

/** A new issue Pi proposes. */
export interface IssueProposal extends IssueDraft, WithPictures {
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
export interface EditProposal extends IssueText, WithPictures {
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

/**
 * The chat's own entries (spec 026); Pi's replies, its tools and the ends of its turns are the
 * agent package's shared entries around them. `at` is in epoch milliseconds.
 */
export type BrainstormEntry =
  /** What the owner wrote; `images` are the ids of the pictures it attached, in order. */
  | {
      readonly kind: 'said';
      readonly id: string;
      readonly at: number;
      readonly text: string;
      readonly images: ReadonlyArray<string>;
    }
  /**
   * A proposal as Pi made it, or as the owner's decision changed it later: the latest record of
   * an id counts, and shows in the place of its first.
   */
  | { readonly kind: 'proposal'; readonly proposal: ProposalEntry }
  /** A new chat starts here; the chat before it is gone. */
  | { readonly kind: 'chatStarted' };

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

/** The latest record of the proposal with this id, if there is one. */
export const proposalOf = (
  entries: ReadonlyArray<BrainstormEntry>,
  id: string,
): ProposalEntry | undefined =>
  entries
    .flatMap((entry) => (entry.kind === 'proposal' && entry.proposal.id === id ? [entry] : []))
    .at(-1)?.proposal;

/** At most this many pictures go with one proposal. */
export const MAX_PROPOSAL_PICTURES = 5;

/** A picture of the chat and its number, counted from 1 in the order it was sent. */
export interface ChatPicture {
  readonly id: string;
  readonly number: number;
}

export const chatPictures = (entries: ReadonlyArray<BrainstormEntry>): ReadonlyArray<ChatPicture> =>
  entries
    .flatMap((entry) => (entry.kind === 'said' ? entry.images : []))
    .map((id, index) => ({ id, number: index + 1 }));

const invalidPictures = (message: string) =>
  Result.fail(new InvalidInputError({ issues: [{ field: 'pictures', message }] }));

/** The chosen pictures in number order; more than allowed, a repeat or an unknown one is refused. */
const choosePictures = <K extends 'id' | 'number'>(
  entries: ReadonlyArray<BrainstormEntry>,
  key: K,
  chosen: ReadonlyArray<ChatPicture[K]>,
  name: (value: ChatPicture[K]) => string,
): Result.Result<ReadonlyArray<string>, InvalidInputError> => {
  if (chosen.length > MAX_PROPOSAL_PICTURES) {
    return invalidPictures(`Choose at most ${MAX_PROPOSAL_PICTURES} pictures.`);
  }
  if (new Set(chosen).size !== chosen.length) return invalidPictures('A picture is chosen twice.');
  const pictures = chatPictures(entries);
  const unknown = chosen.find((value) => !pictures.some((picture) => picture[key] === value));
  if (unknown !== undefined) return invalidPictures(`${name(unknown)} is no picture of this chat.`);
  return Result.succeed(
    pictures.filter((picture) => chosen.includes(picture[key])).map((picture) => picture.id),
  );
};

/** The ids of the pictures Pi names by their numbers. */
export const picturesByNumber = (
  entries: ReadonlyArray<BrainstormEntry>,
  numbers: ReadonlyArray<number>,
) => choosePictures(entries, 'number', numbers, (number) => `Picture ${number}`);

/** The owner's choice of pictures by id, checked against the chat. */
export const parsePictureChoice = (
  entries: ReadonlyArray<BrainstormEntry>,
  ids: ReadonlyArray<string>,
) => choosePictures(entries, 'id', ids, (id) => id);

/** The chosen pictures that are not attached yet. */
export const missingPictures = (
  chosen: ReadonlyArray<string>,
  attached: ReadonlyArray<AttachedPicture>,
): ReadonlyArray<string> => chosen.filter((id) => !attached.some((done) => done.image === id));

/** The body with a Pictures block that links each attached picture, in the given order. */
export const withPictures = (
  body: string,
  pictures: ReadonlyArray<{ readonly number: number; readonly url: string }>,
): string => {
  if (pictures.length === 0) return body;
  const block = [
    '## Pictures',
    pictures.map((picture) => `![Picture ${picture.number}](${picture.url})`).join('\n'),
  ].join('\n\n');
  return body === '' ? block : `${body}\n\n${block}`;
};

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
