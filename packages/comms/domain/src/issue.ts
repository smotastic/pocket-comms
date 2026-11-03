import type { Agent } from './agent.js';
import { BRANCH_TYPES, MAX_TASK_LENGTH } from './task.js';

// The rules of a project's Gitea issues (spec 006): which repository a remote names, the order
// of the list, the branch and the task an issue suggests, which worktrees work on an issue, and
// when an issue is in progress (spec 015).

/** A Gitea issue, or a pull request, which Gitea lists among the issues. */
export interface Issue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  /** The label names. */
  readonly labels: ReadonlyArray<string>;
  /** Epoch milliseconds. */
  readonly updatedAt: number;
  /** The issue's page in Gitea. */
  readonly url: string;
  readonly state: 'open' | 'closed';
  readonly pull: boolean;
}

/** A repository on a Gitea server, by its owner and name. */
export interface GiteaRepository {
  readonly owner: string;
  readonly name: string;
}

/** The repository a remote URL names, and the host it is on, in lower case and without port. */
export interface RemoteRepository extends GiteaRepository {
  readonly host: string;
}

/** A worktree of a project and its branch; a detached worktree has none. */
export interface Worktree {
  readonly path: string;
  readonly branch: string | undefined;
}

/** A worktree on an issue's branch, and the live agents in it. */
export interface IssueWork {
  readonly branch: string;
  readonly agents: ReadonlyArray<Agent>;
}

const repository = (host: string, path: string): RemoteRepository | undefined => {
  const parts = path
    .replace(/\/+$/u, '')
    .replace(/\.git$/u, '')
    .split('/')
    .filter((part) => part !== '');
  const [owner, name] = parts.slice(-2);
  if (host === '' || parts.length < 2 || owner === undefined || name === undefined) {
    return undefined;
  }
  return { host: host.toLowerCase(), owner, name };
};

const URL_REMOTE = /^(?:ssh|https?):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?(\/.*)$/iu;
const SCP_REMOTE = /^(?:[^@/:]+@)?([^/:]+):(?!\/)(.+)$/u;

/**
 * The repository of a remote URL: `host:owner/repo`, `user@host:owner/repo`,
 * `ssh://[user@]host[:port]/owner/repo` or `http(s)://host[:port]/[prefix/]owner/repo`, with or
 * without `.git`. Local paths and other schemes name none.
 */
export const parseRemote = (url: string): RemoteRepository | undefined => {
  const trimmed = url.trim();
  const byUrl = URL_REMOTE.exec(trimmed);
  if (byUrl !== null) return repository(byUrl[1] ?? '', byUrl[2] ?? '');
  if (trimmed.includes('://')) return undefined;
  const byScp = SCP_REMOTE.exec(trimmed);
  return byScp === null ? undefined : repository(byScp[1] ?? '', byScp[2] ?? '');
};

/** The open issues without pull requests, the most recently updated first. */
export const orderIssues = (issues: ReadonlyArray<Issue>): ReadonlyArray<Issue> =>
  issues
    .filter((issue) => !issue.pull)
    .sort((a, b) => b.updatedAt - a.updatedAt || b.number - a.number);

/** How long `<number>-<description>` of a suggested branch may be. */
export const MAX_ISSUE_DESCRIPTION = 40;

const CONVENTIONAL_PREFIX = /^([A-Za-z]+)(?:\([^)]*\))?!?:\s*/u;

const isBranchType = (word: string): word is (typeof BRANCH_TYPES)[number] =>
  (BRANCH_TYPES as ReadonlyArray<string>).includes(word);

const kebabWords = (text: string): ReadonlyArray<string> =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== '');

/**
 * The branch an issue suggests (spec 006, requirement 11): `<type>/<number>-<description>`, the
 * type from the title's conventional prefix, else `fix` for a bug, else `feat`.
 */
export const issueBranch = (issue: Issue): string => {
  const prefix = CONVENTIONAL_PREFIX.exec(issue.title);
  const declared = prefix?.[1]?.toLowerCase();
  const typed = declared !== undefined && isBranchType(declared);
  const words = kebabWords(typed ? issue.title.slice(prefix?.[0].length ?? 0) : issue.title);
  const bug =
    issue.labels.some((label) => label.toLowerCase() === 'bug') ||
    words[0] === 'fix' ||
    words[0] === 'bug';
  const type = typed ? declared : bug ? 'fix' : 'feat';

  const number = String(issue.number);
  let description = number;
  for (const word of words) {
    const longer = `${description}-${word}`;
    if (longer.length > MAX_ISSUE_DESCRIPTION) break;
    description = longer;
  }
  if (description === number) {
    const room = MAX_ISSUE_DESCRIPTION - number.length - 1;
    const first = words[0]?.slice(0, room) ?? '';
    description = `${number}-${first === '' ? 'issue' : first}`;
  }
  return `${type}/${description}`;
};

const ISSUE_BRANCH = new RegExp(`^(?:${BRANCH_TYPES.join('|')})/([1-9][0-9]*)-[a-z0-9]`, 'u');

/** The issue a branch works on, when it has the shape `<type>/<number>-<description>`. */
export const issueNumberOf = (branch: string): number | undefined => {
  const match = ISSUE_BRANCH.exec(branch);
  return match?.[1] === undefined ? undefined : Number(match[1]);
};

const CUT = '[…] The issue is longer; read it in Gitea.';

/**
 * The task an issue gives an agent (spec 006, requirement 13): the title, the body and the
 * issue's reference, within the length of a task.
 */
export const issueTask = (issue: Issue): string => {
  const title = issue.title.trim();
  const footer = [
    `Gitea issue #${issue.number}: ${issue.url}`,
    `Implement this issue. Write "Closes #${issue.number}" in the pull request description.`,
  ].join('\n');
  const body = issue.body.replaceAll('\r\n', '\n').trim();
  if (body === '') return `${title}\n\n${footer}`;
  const room = MAX_TASK_LENGTH - title.length - footer.length - 4;
  const fitted =
    body.length <= room ? body : `${body.slice(0, room - CUT.length - 2).trimEnd()}\n\n${CUT}`;
  return `${title}\n\n${fitted}\n\n${footer}`;
};

const isIn = (cwd: string | undefined, path: string) =>
  cwd !== undefined && (cwd === path || cwd.startsWith(`${path}/`));

/**
 * The worktrees on each issue's branch with the live agents in them (spec 006, requirement 15),
 * by issue number, in worktree order.
 */
export const workOnIssues = (
  worktrees: ReadonlyArray<Worktree>,
  agents: ReadonlyArray<Agent>,
): ReadonlyMap<number, ReadonlyArray<IssueWork>> => {
  const work = new Map<number, Array<IssueWork>>();
  for (const worktree of worktrees) {
    const number = worktree.branch === undefined ? undefined : issueNumberOf(worktree.branch);
    if (number === undefined || worktree.branch === undefined) continue;
    const entry: IssueWork = {
      branch: worktree.branch,
      agents: agents.filter((agent) => isIn(agent.cwd, worktree.path)),
    };
    work.set(number, [...(work.get(number) ?? []), entry]);
  }
  return work;
};

/** The label pocket-comms puts on an issue it starts (spec 015). */
export const IN_PROGRESS_LABEL = 'status/in-progress';

/** How the label looks when pocket-comms creates it in a repository: a scoped, exclusive label. */
export const IN_PROGRESS_LABEL_STYLE = {
  color: '#e3b341',
  description: 'Being worked on (set by pocket-comms)',
  exclusive: true,
} as const;

/** Whether a label name is the in-progress label, in any case. */
export const isInProgressLabel = (label: string): boolean =>
  label.toLowerCase() === IN_PROGRESS_LABEL;

export const hasInProgressLabel = (issue: Issue): boolean => issue.labels.some(isInProgressLabel);

/**
 * Whether an issue is in progress (spec 015, requirement 7): it has the label, or a worktree works
 * on it, which also covers issues started by hand.
 */
export const isInProgress = (issue: Issue, work: ReadonlyArray<IssueWork>): boolean =>
  hasInProgressLabel(issue) || work.length > 0;
