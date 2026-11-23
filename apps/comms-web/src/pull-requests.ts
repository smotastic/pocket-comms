import type { CodeDiffFile, CodeDiffLabels } from '@smotastic/pocket-design';
import type { AttachedPullRequestView, ChangedFileView, PullRequestRef } from './comms-client.js';

// The words and shapes of an agent's attached pull requests (spec 031).

/** Names a pull request in a row or a sheet: `repo #number`. */
export const pullRequestName = ({ name, number }: PullRequestRef): string => `${name} #${number}`;

/** Names a pull request in its sheet: `owner/repo #number` (requirement 15). */
export const pullRequestTitle = ({ owner, name, number }: PullRequestRef): string =>
  `${owner}/${name} #${number}`;

/** A pull request in the route's search: `owner/repo/number`. */
export const pullRequestSearch = ({ owner, name, number }: PullRequestRef): string =>
  `${owner}/${name}/${number}`;

const SEARCH = /^([A-Za-z0-9._-]{1,100})\/([A-Za-z0-9._-]{1,100})\/([1-9][0-9]{0,8})$/u;

/** The pull request a route's search names, if it names one. */
export const parsePullRequestSearch = (value: unknown): PullRequestRef | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = SEARCH.exec(value);
  return match === null
    ? undefined
    : { owner: match[1] ?? '', name: match[2] ?? '', number: Number(match[3]) };
};

/** A stable key of a pull request, such as for React. */
export const pullRequestId = ({ owner, name, number }: PullRequestRef): string =>
  `${owner}/${name}#${number}`;

export const STATE_LABELS: Record<NonNullable<AttachedPullRequestView['state']>, string> = {
  open: 'open',
  merged: 'merged',
  closed: 'closed',
};

/** The muted line under a pull request's name: its state and title, or why it is unavailable. */
export const pullRequestDetail = (pullRequest: AttachedPullRequestView): string =>
  pullRequest.unavailable !== undefined
    ? pullRequest.unavailable
    : `${pullRequest.state === undefined ? '' : `${STATE_LABELS[pullRequest.state]} · `}${pullRequest.title ?? ''}`;

/** The More button's name, which says the count the button shows (requirement 11). */
export const moreLabel = (count: number): string =>
  count === 0 ? 'More' : `More, ${count} pull request${count === 1 ? '' : 's'}`;

/** Gitea's page of a pull request's changed files. */
export const filesPage = (url: string): string => `${url.replace(/\/+$/u, '')}/files`;

/** A changed file as the kit's `CodeDiff` takes it. */
export const toCodeDiffFile = (file: ChangedFileView, pullRequestUrl: string): CodeDiffFile => ({
  id: file.path,
  path: file.path,
  ...(file.previousPath === undefined ? {} : { previousPath: file.previousPath }),
  status: file.kind,
  additions: file.additions,
  deletions: file.deletions,
  content:
    file.shown.kind === 'hunks'
      ? {
          kind: 'hunks',
          hunks: file.shown.hunks.map((hunk) => ({
            header: hunk.header,
            lines: hunk.lines.map((line) => ({
              kind: line.kind,
              text: line.text,
              ...(line.old === undefined ? {} : { oldNumber: line.old }),
              ...(line.new === undefined ? {} : { newNumber: line.new }),
            })),
          })),
        }
      : { kind: file.shown.kind },
  ...(file.shown.kind === 'hunks' ? {} : { href: filesPage(pullRequestUrl) }),
});

export const CODE_DIFF_LABELS: CodeDiffLabels = {
  files: 'Changed files',
  empty: 'No files changed.',
  status: { added: 'added', deleted: 'deleted', modified: 'modified', renamed: 'renamed' },
  renamedFrom: (path) => `from ${path}`,
  counts: (additions, deletions) => `+${additions} −${deletions}`,
  added: 'added',
  removed: 'removed',
  binary: 'Binary file, not shown',
  tooLarge: 'Too large to show here',
  open: 'Open the file in Gitea',
};
