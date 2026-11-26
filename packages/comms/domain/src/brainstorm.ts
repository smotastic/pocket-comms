import type { FieldIssue } from '@pocket-comms/backend-shared';
import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';

// The rules of the brainstorm: what the conversation holds, the issue or the edit
// a proposal proposes and how it is decided, the images that go with it, the issues Pi read, and
// the planet files Pi may read.

/** Gitea's limit of an issue title. */
export const MAX_ISSUE_TITLE = 255;
export const MAX_ISSUE_BODY = 20_000;

/** The issue a proposal proposes: the planet by its name, the title and the Markdown body. */
export interface ProposedIssue {
  readonly planet: string;
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
 * while the issue exists but its images are not all attached (spec 023).
 */
export type ProposalState =
  | { readonly _tag: 'open' }
  | { readonly _tag: 'created'; readonly number: number; readonly url: string }
  | { readonly _tag: 'discarded' }
  | { readonly _tag: 'attaching'; readonly number: number; readonly url: string };

/** A brainstorm image that is an attachment of the issue in Gitea, and its link there. */
export interface AttachedImage {
  readonly image: string;
  readonly url: string;
}

/**
 * The brainstorm images that go with a proposal, by image id: the ones Pi named, then the owner's
 * choice. `attached` are those already in Gitea, so a retry never uploads one twice.
 */
interface WithImages {
  readonly images: ReadonlyArray<string>;
  readonly attached: ReadonlyArray<AttachedImage>;
}

/** An edit is open until the owner applies or discards it, once. */
export type EditState =
  | { readonly _tag: 'open' }
  | { readonly _tag: 'updated'; readonly url: string }
  | { readonly _tag: 'discarded' };

/** A new issue Pi proposes. */
export interface IssueProposal extends ProposedIssue, WithImages {
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
export interface EditProposal extends IssueText, WithImages {
  readonly type: 'proposal';
  readonly kind: 'edit';
  readonly id: string;
  readonly at: number;
  readonly planet: string;
  readonly number: number;
  /** The issue's page in Gitea. */
  readonly url: string;
  readonly base: IssueText;
  readonly state: EditState;
}

export type ProposalEntry = IssueProposal | EditProposal;

/**
 * The brainstorm's own entries (spec 026); Pi's replies, its tools and the ends of its turns are the
 * agent package's shared entries around them. `at` is in epoch milliseconds.
 */
export type BrainstormEntry =
  /** What the owner wrote; `images` are the ids of the images it attached, in order. */
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
  /** A new brainstorm starts here; the brainstorm before it is gone. */
  | { readonly kind: 'brainstormStarted' };

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

/** The proposed issue, trimmed; a blank planet or title, or a field over its limit, is refused. */
export const parseProposedIssue = (
  issue: ProposedIssue,
): Result.Result<ProposedIssue, InvalidInputError> => {
  const planet = issue.planet.trim();
  const title = issue.title.trim();
  const body = issue.body.trim();
  const issues: Array<FieldIssue> = [
    ...(planet === '' ? [{ field: 'planet', message: 'Choose a planet.' }] : []),
    ...textIssues(title, body),
  ];
  return issues.length === 0
    ? Result.succeed({ planet, title, body })
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

/** At most this many images go with one proposal. */
export const MAX_PROPOSAL_IMAGES = 5;

/** A image of the brainstorm and its number, counted from 1 in the order it was sent. */
export interface BrainstormImage {
  readonly id: string;
  readonly number: number;
}

export const brainstormImages = (
  entries: ReadonlyArray<BrainstormEntry>,
): ReadonlyArray<BrainstormImage> =>
  entries
    .flatMap((entry) => (entry.kind === 'said' ? entry.images : []))
    .map((id, index) => ({ id, number: index + 1 }));

const invalidImages = (message: string) =>
  Result.fail(new InvalidInputError({ issues: [{ field: 'images', message }] }));

/** The chosen images in number order; more than allowed, a repeat or an unknown one is refused. */
const chooseImages = <K extends 'id' | 'number'>(
  entries: ReadonlyArray<BrainstormEntry>,
  key: K,
  chosen: ReadonlyArray<BrainstormImage[K]>,
  name: (value: BrainstormImage[K]) => string,
): Result.Result<ReadonlyArray<string>, InvalidInputError> => {
  if (chosen.length > MAX_PROPOSAL_IMAGES) {
    return invalidImages(`Choose at most ${MAX_PROPOSAL_IMAGES} images.`);
  }
  if (new Set(chosen).size !== chosen.length) return invalidImages('A image is chosen twice.');
  const images = brainstormImages(entries);
  const unknown = chosen.find((value) => !images.some((image) => image[key] === value));
  if (unknown !== undefined)
    return invalidImages(`${name(unknown)} is no image of this brainstorm.`);
  return Result.succeed(
    images.filter((image) => chosen.includes(image[key])).map((image) => image.id),
  );
};

/** The ids of the images Pi names by their numbers. */
export const imagesByNumber = (
  entries: ReadonlyArray<BrainstormEntry>,
  numbers: ReadonlyArray<number>,
) => chooseImages(entries, 'number', numbers, (number) => `Image ${number}`);

/** The owner's choice of images by id, checked against the brainstorm. */
export const parseImageChoice = (
  entries: ReadonlyArray<BrainstormEntry>,
  ids: ReadonlyArray<string>,
) => chooseImages(entries, 'id', ids, (id) => id);

/** The chosen images that are not attached yet. */
export const missingImages = (
  chosen: ReadonlyArray<string>,
  attached: ReadonlyArray<AttachedImage>,
): ReadonlyArray<string> => chosen.filter((id) => !attached.some((done) => done.image === id));

/** The body with an Images block that links each attached image, in the given order. */
export const withImages = (
  body: string,
  images: ReadonlyArray<{ readonly number: number; readonly url: string }>,
): string => {
  if (images.length === 0) return body;
  const block = [
    '## Images',
    images.map((image) => `![Image ${image.number}](${image.url})`).join('\n'),
  ].join('\n\n');
  return body === '' ? block : `${body}\n\n${block}`;
};

/** An issue as Pi last read it; `cut` when its body was longer than Pi may read. */
export interface IssueRead extends IssueText {
  readonly planet: string;
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
  ...reads.filter((kept) => kept.planet !== read.planet || kept.number !== read.number),
  read,
];

/** The last read of a planet's issue, if Pi read it. */
export const readOf = (
  reads: ReadonlyArray<IssueRead>,
  planet: string,
  number: number,
): IssueRead | undefined => reads.find((read) => read.planet === planet && read.number === number);

/** The body Pi may read: at most an issue body's limit, and whether it was cut. */
export const cutIssueBody = (body: string): { readonly body: string; readonly cut: boolean } =>
  body.length <= MAX_ISSUE_BODY
    ? { body, cut: false }
    : { body: body.slice(0, MAX_ISSUE_BODY), cut: true };

/** Whether the issue's title or body differ from the base; its comments and labels do not count. */
export const baseChanged = (base: IssueText, current: IssueText): boolean =>
  base.title !== current.title || base.body !== current.body;

/** The files at a planet's top level that Pi may read; nothing else. */
export const PLANET_DOCS = ['README.md', 'AGENTS.md'] as const;
export type RepositoryDoc = (typeof PLANET_DOCS)[number];

export const isRepositoryDoc = (name: string): name is RepositoryDoc =>
  (PLANET_DOCS as ReadonlyArray<string>).includes(name);

/** Pi reads at most this many characters of a planet doc. */
export const MAX_DOC_LENGTH = 20_000;

export const cutDoc = (text: string): string =>
  text.length <= MAX_DOC_LENGTH
    ? text
    : `${text.slice(0, MAX_DOC_LENGTH)}\n\n[cut: the file is longer]`;
