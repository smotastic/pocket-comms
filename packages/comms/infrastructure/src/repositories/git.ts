import { RepositoryGitError, RepositoriesOutbound } from '@pocket-comms/comms-application';
import type { Repository, RepositoryDoc, Worktree } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';

export interface GitOptions {
  /** The folder whose direct child folders are the planets. */
  readonly root: string;
  /** The folder that holds the new worktrees, one folder per planet (ADR 0015). */
  readonly worktreesRoot: string;
  /** How long a fetch may take. Default 60 seconds. */
  readonly fetchTimeoutMs?: number;
  /**
   * How long removing a worktree may take. It deletes the whole folder, `node_modules` too, so
   * the default is 5 minutes.
   */
  readonly removeTimeoutMs?: number;
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
        // A git stopped for its time limit may have written nothing to say why.
        const reason =
          error?.killed === true ? `git ran out of time after ${timeout} ms.` : error?.message;
        resume(Effect.succeed({ code, stdout, stderr: stderr || (reason ?? '') }));
      },
    );
    return Effect.sync(() => void child.kill());
  });

const isDirectory = (path: string) => existsSync(path) && statSync(path).isDirectory();

const lastLine = (text: string) => text.trim().split('\n').at(-1)?.trim() ?? '';

// `git worktree list --porcelain`: one block per worktree, separated by a blank line, with a
// `worktree <path>` line and a `branch refs/heads/<name>` line unless it is detached.
const parseWorktrees = (porcelain: string): ReadonlyArray<Worktree> =>
  porcelain
    .split(/\n\s*\n/u)
    .map((block) => block.split('\n'))
    .flatMap((lines) => {
      const path = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length);
      const ref = lines.find((line) => line.startsWith('branch '))?.slice('branch '.length);
      if (path === undefined) return [];
      return [
        {
          path,
          branch:
            ref?.startsWith('refs/heads/') === true ? ref.slice('refs/heads/'.length) : undefined,
        },
      ];
    });

/** The git repositories directly below `root`, and git run in them with argument arrays. */
export const layerGit = ({
  root,
  worktreesRoot,
  fetchTimeoutMs = 60_000,
  removeTimeoutMs = 300_000,
}: GitOptions) => {
  const quick = 10_000;

  const run = (planet: Repository, args: ReadonlyArray<string>, timeout = quick) =>
    git(planet.path, args, timeout);

  const failed = (planet: Repository, reason: string) =>
    new RepositoryGitError({ planet: planet.name, reason });

  const list = Effect.promise(async (): Promise<ReadonlyArray<Repository>> => {
    const resolved = await realpath(root).catch(() => undefined);
    if (resolved === undefined) return [];
    const entries = await readdir(resolved, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => entry.isDirectory() && isDirectory(join(resolved, entry.name, '.git')))
      .map((entry) => ({ name: entry.name, path: join(resolved, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }).pipe(Effect.withSpan('Planets.list'));

  const isValidBranchName = (planet: Repository, branch: string) =>
    run(planet, ['check-ref-format', '--branch', branch]).pipe(
      Effect.map((result) => result.code === 0),
      Effect.withSpan('Planets.isValidBranchName'),
    );

  const exists = (planet: Repository, ref: string) =>
    run(planet, ['show-ref', '--verify', '--quiet', ref]).pipe(
      Effect.map((result) => result.code === 0),
    );

  // `origin/HEAD` names the default branch; a clone has it, other repositories may not, so the
  // remote is asked then.
  const remoteHead = (planet: Repository) =>
    Effect.gen(function* () {
      const local = yield* run(planet, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
      if (local.code === 0 && local.stdout.trim() !== '') return local.stdout.trim();
      const remote = yield* run(
        planet,
        ['ls-remote', '--symref', 'origin', 'HEAD'],
        fetchTimeoutMs,
      );
      const match = /^ref: refs\/heads\/(\S+)\s+HEAD$/mu.exec(remote.stdout);
      if (remote.code !== 0 || match?.[1] === undefined) return undefined;
      const base = `origin/${match[1]}`;
      return (yield* exists(planet, `refs/remotes/${base}`)) ? base : undefined;
    });

  const defaultBase = (planet: Repository) =>
    Effect.gen(function* () {
      const fetched = yield* run(planet, ['fetch', '--prune', 'origin'], fetchTimeoutMs);
      if (fetched.code !== 0) {
        return yield* failed(planet, `git fetch failed: ${lastLine(fetched.stderr)}`);
      }
      const base = yield* remoteHead(planet);
      if (base === undefined) {
        return yield* failed(planet, 'origin has no default branch.');
      }
      return base;
    }).pipe(Effect.withSpan('Planets.defaultBase'));

  const branchExists = (planet: Repository, branch: string) =>
    Effect.gen(function* () {
      if (yield* exists(planet, `refs/heads/${branch}`)) return true;
      return yield* exists(planet, `refs/remotes/origin/${branch}`);
    }).pipe(Effect.withSpan('Planets.branchExists'));

  const originUrl = (planet: Repository) =>
    run(planet, ['remote', 'get-url', 'origin']).pipe(
      Effect.map((result) =>
        result.code === 0 && result.stdout.trim() !== ''
          ? Option.some(result.stdout.trim())
          : Option.none(),
      ),
      Effect.withSpan('Planets.originUrl'),
    );

  const worktrees = (planet: Repository) =>
    Effect.gen(function* () {
      const listed = yield* run(planet, ['worktree', 'list', '--porcelain']);
      if (listed.code !== 0) {
        return yield* failed(planet, `git worktree list failed: ${lastLine(listed.stderr)}`);
      }
      return parseWorktrees(listed.stdout);
    }).pipe(Effect.withSpan('Planets.worktrees'));

  // Untracked files count: removing the worktree would delete them too.
  const hasChanges = (planet: Repository, path: string) =>
    Effect.gen(function* () {
      const status = yield* git(path, ['status', '--porcelain', '--untracked-files=all'], quick);
      if (status.code !== 0) {
        return yield* failed(planet, `git status failed: ${lastLine(status.stderr)}`);
      }
      return status.stdout.trim() !== '';
    }).pipe(Effect.withSpan('Planets.hasChanges'));

  // The folder is named as Herdr names it, the branch with `-` for `/`, so the worktrees of
  // both live side by side.
  const addWorktree = (
    planet: Repository,
    request: { readonly branch: string; readonly base: string },
  ) =>
    Effect.gen(function* () {
      const path = join(worktreesRoot, planet.name, request.branch.replaceAll('/', '-'));
      const added = yield* run(planet, [
        'worktree',
        'add',
        '--quiet',
        '-b',
        request.branch,
        path,
        request.base,
      ]);
      if (added.code !== 0) {
        return yield* failed(planet, `git worktree add failed: ${lastLine(added.stderr)}`);
      }
      return { path, branch: request.branch };
    }).pipe(Effect.withSpan('Planets.addWorktree'));

  const removeWorktree = (planet: Repository, path: string, force: boolean) =>
    Effect.gen(function* () {
      // A removal stopped halfway leaves a half-deleted folder, so a caller that stops waiting,
      // such as a phone that drops the request, does not stop it.
      const removed = yield* Effect.uninterruptible(
        run(planet, ['worktree', 'remove', ...(force ? ['--force'] : []), path], removeTimeoutMs),
      );
      if (removed.code !== 0) {
        return yield* failed(planet, `git worktree remove failed: ${lastLine(removed.stderr)}`);
      }
    }).pipe(Effect.withSpan('Planets.removeWorktree'));

  // Only a regular file directly in the planet folder: a symlink could point anywhere.
  const readDoc = (planet: Repository, doc: RepositoryDoc) =>
    Effect.promise(async () => {
      const path = join(planet.path, doc);
      try {
        const stats = await lstat(path);
        return stats.isFile() ? Option.some(await readFile(path, 'utf-8')) : Option.none();
      } catch {
        return Option.none<string>();
      }
    }).pipe(Effect.withSpan('Planets.readDoc'));

  return Layer.succeed(
    RepositoriesOutbound,
    RepositoriesOutbound.of({
      list,
      isValidBranchName,
      defaultBase,
      branchExists,
      originUrl,
      worktrees,
      hasChanges,
      addWorktree,
      removeWorktree,
      readDoc,
    }),
  );
};
