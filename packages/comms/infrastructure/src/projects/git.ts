import { ProjectGitError, ProjectsOutbound } from '@pocket-comms/comms-application';
import type { Project } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

export interface GitOptions {
  /** The folder whose direct child folders are the projects. */
  readonly root: string;
  /** How long a fetch may take. Default 60 seconds. */
  readonly fetchTimeoutMs?: number;
}

interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

// The variables that tell git which repository to use. A process started from a git hook
// inherits them, and they win over `cwd`, so git would work on that other repository.
const REPOSITORY_VARIABLES = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_NAMESPACE',
  'GIT_PREFIX',
  'GIT_QUARANTINE_PATH',
  'GIT_CEILING_DIRECTORIES',
  'GIT_DISCOVERY_ACROSS_FILESYSTEM',
];

/**
 * The environment git runs with: `env` without the variables that pick a repository, so git
 * works in its `cwd`, and with prompts off, so it never waits for a password.
 */
export const gitEnvironment = (
  env: Record<string, string | undefined>,
): Record<string, string | undefined> => {
  const clean: Record<string, string | undefined> = { ...env, GIT_TERMINAL_PROMPT: '0' };
  for (const name of REPOSITORY_VARIABLES) delete clean[name];
  return clean;
};

// Runs git with an argument array, never through a shell.
const git = (cwd: string, args: ReadonlyArray<string>, timeout: number) =>
  Effect.callback<GitResult>((resume) => {
    const child = execFile(
      'git',
      [...args],
      { cwd, timeout, env: gitEnvironment(process.env) },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : Number.NaN;
        resume(Effect.succeed({ code, stdout, stderr: stderr || (error?.message ?? '') }));
      },
    );
    return Effect.sync(() => void child.kill());
  });

const isDirectory = (path: string) => existsSync(path) && statSync(path).isDirectory();

const lastLine = (text: string) => text.trim().split('\n').at(-1)?.trim() ?? '';

/** The git repositories directly below `root`, and git run in them with argument arrays. */
export const layerGit = ({ root, fetchTimeoutMs = 60_000 }: GitOptions) => {
  const quick = 10_000;

  const run = (project: Project, args: ReadonlyArray<string>, timeout = quick) =>
    git(project.path, args, timeout);

  const failed = (project: Project, reason: string) =>
    new ProjectGitError({ project: project.name, reason });

  const list = Effect.promise(async (): Promise<ReadonlyArray<Project>> => {
    const resolved = await realpath(root).catch(() => undefined);
    if (resolved === undefined) return [];
    const entries = await readdir(resolved, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => entry.isDirectory() && isDirectory(join(resolved, entry.name, '.git')))
      .map((entry) => ({ name: entry.name, path: join(resolved, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }).pipe(Effect.withSpan('Projects.list'));

  const isValidBranchName = (project: Project, branch: string) =>
    run(project, ['check-ref-format', '--branch', branch]).pipe(
      Effect.map((result) => result.code === 0),
      Effect.withSpan('Projects.isValidBranchName'),
    );

  const exists = (project: Project, ref: string) =>
    run(project, ['show-ref', '--verify', '--quiet', ref]).pipe(
      Effect.map((result) => result.code === 0),
    );

  // `origin/HEAD` names the default branch; a clone has it, other repositories may not, so the
  // remote is asked then.
  const remoteHead = (project: Project) =>
    Effect.gen(function* () {
      const local = yield* run(project, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
      if (local.code === 0 && local.stdout.trim() !== '') return local.stdout.trim();
      const remote = yield* run(
        project,
        ['ls-remote', '--symref', 'origin', 'HEAD'],
        fetchTimeoutMs,
      );
      const match = /^ref: refs\/heads\/(\S+)\s+HEAD$/mu.exec(remote.stdout);
      if (remote.code !== 0 || match?.[1] === undefined) return undefined;
      const base = `origin/${match[1]}`;
      return (yield* exists(project, `refs/remotes/${base}`)) ? base : undefined;
    });

  const defaultBase = (project: Project) =>
    Effect.gen(function* () {
      const fetched = yield* run(project, ['fetch', '--prune', 'origin'], fetchTimeoutMs);
      if (fetched.code !== 0) {
        return yield* failed(project, `git fetch failed: ${lastLine(fetched.stderr)}`);
      }
      const base = yield* remoteHead(project);
      if (base === undefined) {
        return yield* failed(project, 'origin has no default branch.');
      }
      return base;
    }).pipe(Effect.withSpan('Projects.defaultBase'));

  const branchExists = (project: Project, branch: string) =>
    Effect.gen(function* () {
      if (yield* exists(project, `refs/heads/${branch}`)) return true;
      return yield* exists(project, `refs/remotes/origin/${branch}`);
    }).pipe(Effect.withSpan('Projects.branchExists'));

  return Layer.succeed(
    ProjectsOutbound,
    ProjectsOutbound.of({ list, isValidBranchName, defaultBase, branchExists }),
  );
};
