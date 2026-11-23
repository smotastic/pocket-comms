import * as Data from 'effect/Data';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';
import type { GiteaRepository } from './issue.js';

// The rules of the pull requests an agent attaches to its conversation (spec 031): which page names
// a pull request, the list each agent keeps, its state, and the changed files read from a unified
// diff.

/** A pull request on the app's Gitea, by its repository and number. */
export interface PullRequestRef extends GiteaRepository {
  readonly number: number;
}

/** A pull request in an agent's list, with its page and when it was attached (epoch milliseconds). */
export interface AttachedPullRequestRef extends PullRequestRef {
  readonly url: string;
  readonly attachedAt: number;
}

/** How many pull requests one agent's list holds (requirement 5). */
export const MAX_ATTACHED_PULL_REQUESTS = 20;

/** A file with more added and removed lines than this shows no lines (requirement 18). */
export const MAX_SHOWN_FILE_LINES = 1500;

/** The largest diff the server reads; above it the changes are the file list (requirement 19). */
export const MAX_DIFF_BYTES = 2 * 1024 * 1024;

/** Gitea's names of owners and repositories. */
const NAME = /^[A-Za-z0-9._-]{1,100}$/u;

const isName = (value: string | undefined): value is string =>
  value !== undefined && NAME.test(value) && value !== '.' && value !== '..';

const NUMBER = /^[1-9][0-9]{0,8}$/u;

/** The list is full: the agent has the most pull requests it may have. */
export class PullRequestListFullError extends Data.TaggedError('PullRequestListFullError')<{
  readonly limit: number;
}> {}

export const samePullRequest = (a: PullRequestRef, b: PullRequestRef): boolean =>
  a.owner.toLowerCase() === b.owner.toLowerCase() &&
  a.name.toLowerCase() === b.name.toLowerCase() &&
  a.number === b.number;

/**
 * The pull request a Gitea page names, `/<owner>/<repo>/pulls/<number>`, also its files or
 * commits; `base` is the path Gitea is served below, if any.
 */
export const parsePullRequestPath = (
  pathname: string,
  base = '',
): Option.Option<PullRequestRef> => {
  const prefix = base.replace(/\/+$/u, '');
  if (!pathname.startsWith(`${prefix}/`)) return Option.none();
  const [owner, name, pulls, number] = pathname.slice(prefix.length + 1).split('/');
  if (!isName(owner) || !isName(name) || pulls !== 'pulls' || number === undefined) {
    return Option.none();
  }
  return NUMBER.test(number) ? Option.some({ owner, name, number: Number(number) }) : Option.none();
};

/** A repository named as `owner/name`. */
export const parseRepositoryName = (
  repository: string,
): Result.Result<GiteaRepository, InvalidInputError> => {
  const [owner, name, ...rest] = repository.split('/');
  return isName(owner) && isName(name) && rest.length === 0
    ? Result.succeed({ owner, name })
    : Result.fail(
        new InvalidInputError({
          issues: [{ field: 'repository', message: 'Name the repository as owner/name.' }],
        }),
      );
};

/**
 * The list with the pull request attached: unchanged when it is there already, so attaching again
 * is harmless, and refused once the list is full.
 */
export const attachTo = (
  list: ReadonlyArray<AttachedPullRequestRef>,
  attached: AttachedPullRequestRef,
): Result.Result<ReadonlyArray<AttachedPullRequestRef>, PullRequestListFullError> => {
  if (list.some((entry) => samePullRequest(entry, attached))) return Result.succeed(list);
  if (list.length >= MAX_ATTACHED_PULL_REQUESTS) {
    return Result.fail(new PullRequestListFullError({ limit: MAX_ATTACHED_PULL_REQUESTS }));
  }
  return Result.succeed([...list, attached]);
};

export type PullRequestState = 'open' | 'merged' | 'closed';

/** Gitea closes a merged pull request and says it was merged. */
export const pullRequestState = (state: string, merged: boolean): PullRequestState =>
  merged ? 'merged' : state === 'open' ? 'open' : 'closed';

export type ChangedFileKind = 'added' | 'deleted' | 'modified' | 'renamed';

export interface DiffLine {
  readonly kind: 'context' | 'added' | 'removed';
  /** The line without its sign. */
  readonly text: string;
  /** Its number in the old file; absent for an added line. */
  readonly old?: number;
  /** Its number in the new file; absent for a removed line. */
  readonly new?: number;
}

export interface DiffHunk {
  /** The hunk's header line as the diff wrote it. */
  readonly header: string;
  readonly lines: ReadonlyArray<DiffLine>;
}

/** What the changes show of a file: its hunks, or why none. */
export type ShownChanges =
  | { readonly kind: 'hunks'; readonly hunks: ReadonlyArray<DiffHunk> }
  | { readonly kind: 'binary' }
  | { readonly kind: 'too-large' };

export interface ChangedFile {
  readonly path: string;
  /** The path before a rename. */
  readonly previousPath?: string;
  readonly kind: ChangedFileKind;
  readonly additions: number;
  readonly deletions: number;
  readonly shown: ShownChanges;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u;

interface FileDraft {
  header: string;
  oldPath: string | undefined;
  newPath: string | undefined;
  renameFrom: string | undefined;
  renameTo: string | undefined;
  added: boolean;
  deleted: boolean;
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: Array<{ header: string; lines: Array<DiffLine> }>;
  oldLine: number;
  newLine: number;
}

/** The path of a `---`/`+++` line, without its `a/` or `b/`; `/dev/null` is none. */
const markerPath = (rest: string): string | undefined => {
  const path = rest.replace(/\t.*$/u, '');
  if (path === '/dev/null') return undefined;
  return path.replace(/^[ab]\//u, '');
};

/** The new path of a `diff --git a/x b/x` header, for a file without `---`/`+++` lines. */
const headerPath = (header: string): string => {
  const rest = header.slice('diff --git '.length);
  // Both halves are the same path for anything but a rename, which names its paths itself.
  const half = (rest.length - 1) / 2;
  if (Number.isInteger(half) && rest.slice(0, 2) === 'a/' && rest[half] === ' ') {
    return rest.slice(half + 3);
  }
  const at = rest.lastIndexOf(' b/');
  return at === -1 ? rest : rest.slice(at + 3);
};

const finish = (draft: FileDraft): ChangedFile => {
  const path = draft.renameTo ?? draft.newPath ?? draft.oldPath ?? headerPath(draft.header);
  const previousPath = draft.renameFrom ?? undefined;
  const kind: ChangedFileKind = draft.added
    ? 'added'
    : draft.deleted
      ? 'deleted'
      : previousPath !== undefined && previousPath !== path
        ? 'renamed'
        : 'modified';
  const shown: ShownChanges = draft.binary
    ? { kind: 'binary' }
    : draft.additions + draft.deletions > MAX_SHOWN_FILE_LINES
      ? { kind: 'too-large' }
      : { kind: 'hunks', hunks: draft.hunks };
  return {
    path,
    ...(kind === 'renamed' && previousPath !== undefined ? { previousPath } : {}),
    kind,
    additions: draft.additions,
    deletions: draft.deletions,
    shown,
  };
};

/**
 * The changed files of a git unified diff, such as a pull request's `.diff`, in its order. A file
 * with more than `MAX_SHOWN_FILE_LINES` changed lines keeps its counts and drops its lines. Lines
 * it does not know are skipped.
 */
export const parseUnifiedDiff = (text: string): ReadonlyArray<ChangedFile> => {
  const files: Array<ChangedFile> = [];
  let draft: FileDraft | undefined;
  let inHunk = false;
  const keepLines = () =>
    draft !== undefined && draft.additions + draft.deletions <= MAX_SHOWN_FILE_LINES;

  for (const line of text.split(/\r?\n/u)) {
    if (line.startsWith('diff --git ')) {
      if (draft !== undefined) files.push(finish(draft));
      draft = {
        header: line,
        oldPath: undefined,
        newPath: undefined,
        renameFrom: undefined,
        renameTo: undefined,
        added: false,
        deleted: false,
        binary: false,
        additions: 0,
        deletions: 0,
        hunks: [],
        oldLine: 0,
        newLine: 0,
      };
      inHunk = false;
      continue;
    }
    if (draft === undefined) continue;

    const hunk = HUNK.exec(line);
    if (hunk !== null) {
      inHunk = true;
      draft.oldLine = Number(hunk[1]);
      draft.newLine = Number(hunk[2]);
      draft.hunks.push({ header: line, lines: [] });
      continue;
    }
    if (inHunk) {
      const current = draft.hunks.at(-1);
      const sign = line[0];
      const rest = line.slice(1);
      if (sign === '+') {
        draft.additions += 1;
        if (keepLines()) current?.lines.push({ kind: 'added', text: rest, new: draft.newLine });
        draft.newLine += 1;
        continue;
      }
      if (sign === '-') {
        draft.deletions += 1;
        if (keepLines()) current?.lines.push({ kind: 'removed', text: rest, old: draft.oldLine });
        draft.oldLine += 1;
        continue;
      }
      if (sign === ' ') {
        if (keepLines()) {
          current?.lines.push({
            kind: 'context',
            text: rest,
            old: draft.oldLine,
            new: draft.newLine,
          });
        }
        draft.oldLine += 1;
        draft.newLine += 1;
        continue;
      }
      if (sign === '\\') continue;
      inHunk = false;
    }

    if (line.startsWith('new file mode')) draft.added = true;
    else if (line.startsWith('deleted file mode')) draft.deleted = true;
    else if (line.startsWith('rename from ')) draft.renameFrom = line.slice('rename from '.length);
    else if (line.startsWith('rename to ')) draft.renameTo = line.slice('rename to '.length);
    else if (line.startsWith('--- ')) draft.oldPath = markerPath(line.slice(4));
    else if (line.startsWith('+++ ')) draft.newPath = markerPath(line.slice(4));
    else if (line === 'GIT binary patch' || /^Binary files .* differ$/u.test(line)) {
      draft.binary = true;
    }
  }
  if (draft !== undefined) files.push(finish(draft));
  return files;
};
