import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import { InvalidInputError } from './errors.js';
import type { Workspace } from './workspace.js';

// The rules of a new task (spec 005): a project to work in, the task text, the branch of the new
// worktree, and optionally the agent to start in it.

export const MAX_TASK_LENGTH = 20_000;
export const MAX_TITLE_LENGTH = 80;
export const MAX_BRANCH_LENGTH = 80;

/** A git repository directly below the projects root, by its folder name. */
export interface Project {
  readonly name: string;
  readonly path: string;
}

/** A project as the app offers it: `open` when Herdr has a workspace for it. */
export interface ProjectChoice extends Project {
  readonly open: boolean;
}

/** Projects open in Herdr first, in Herdr's workspace order, then the others by name. */
export const orderProjects = (
  projects: ReadonlyArray<Project>,
  workspaces: ReadonlyArray<Workspace>,
): ReadonlyArray<ProjectChoice> => {
  const rank = new Map<string, number>();
  for (const workspace of workspaces) {
    if (workspace.root !== undefined && !rank.has(workspace.root)) {
      rank.set(workspace.root, rank.size);
    }
  }
  const open = projects
    .filter((project) => rank.has(project.path))
    .sort((a, b) => (rank.get(a.path) ?? 0) - (rank.get(b.path) ?? 0));
  const others = projects
    .filter((project) => !rank.has(project.path))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [
    ...open.map((project) => ({ ...project, open: true })),
    ...others.map((project) => ({ ...project, open: false })),
  ];
};

const invalid = (field: string, message: string) =>
  Result.fail(new InvalidInputError({ issues: [{ field, message }] }));

/** The task text, trimmed, and its title: the first non-blank line, cut to 80 characters. */
export interface Task {
  readonly text: string;
  readonly title: string;
}

export const parseTask = (text: string): Result.Result<Task, InvalidInputError> => {
  const trimmed = text.trim();
  if (trimmed === '') return invalid('task', 'Describe the task first.');
  if (trimmed.length > MAX_TASK_LENGTH) {
    return invalid('task', `The task is longer than ${MAX_TASK_LENGTH} characters.`);
  }
  const firstLine = trimmed.split('\n', 1)[0] ?? trimmed;
  return Result.succeed({ text: trimmed, title: firstLine.trim().slice(0, MAX_TITLE_LENGTH) });
};

/** The branch types of the repository conventions. */
export const BRANCH_TYPES = [
  'feat',
  'fix',
  'chore',
  'docs',
  'refactor',
  'test',
  'ci',
  'build',
] as const;

const BRANCH = new RegExp(`^(?:${BRANCH_TYPES.join('|')})/[a-z0-9]+(?:-[a-z0-9]+)*$`, 'u');

/**
 * A branch is `<type>/<kebab-description>`. Git's own rule (`check-ref-format`) is checked on top
 * by the adapter that runs git.
 */
export const parseBranch = (branch: string): Result.Result<string, InvalidInputError> =>
  branch.length <= MAX_BRANCH_LENGTH && BRANCH.test(branch)
    ? Result.succeed(branch)
    : invalid(
        'branch',
        `Name the branch <type>/<kebab-description>, such as feat/new-task, with a type of ${BRANCH_TYPES.slice(0, -1).join(', ')} or ${BRANCH_TYPES.at(-1) ?? ''}.`,
      );

/** The agents the app can start in a new worktree. */
export const AgentToStart = Schema.Literals(['claude', 'pi']);
export type AgentToStart = typeof AgentToStart.Type;

const isAgentToStart = Schema.is(AgentToStart);

export const parseAgentToStart = (kind: string): Result.Result<AgentToStart, InvalidInputError> =>
  isAgentToStart(kind) ? Result.succeed(kind) : invalid('agent', `${kind} cannot be started.`);

/** The new agent's Herdr name: the branch with `-` for `/`, numbered when a live agent has it. */
export const agentNameFor = (branch: string, taken: ReadonlySet<string>): string => {
  const base = branch.replaceAll('/', '-');
  if (!taken.has(base)) return base;
  let number = 2;
  while (taken.has(`${base}-${number}`)) number += 1;
  return `${base}-${number}`;
};
