import { describe, expect, it } from '@effect/vitest';
import { ProjectGitError, ProjectsOutbound } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerGit } from './git.js';

const run = (cwd: string, ...args: Array<string>) =>
  execFileSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
    stdio: 'pipe',
  }).toString();

// A projects root with `alpha` (cloned from a bare `origin` with `main` and `feat/taken`),
// `beta` (no remote), a plain folder, a file, and a linked worktree of `alpha`.
const projectsRoot = () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'projects-')));
  const root = join(base, 'root');
  const origin = join(base, 'origin.git');
  mkdirSync(root);
  run(base, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
  const seed = join(base, 'seed');
  run(base, 'clone', '--quiet', origin, seed);
  writeFileSync(join(seed, 'README.md'), 'seed\n');
  run(seed, 'add', '.');
  run(seed, 'commit', '--quiet', '-m', 'seed');
  run(seed, 'push', '--quiet', 'origin', 'HEAD:main', 'HEAD:feat/taken');
  run(root, 'clone', '--quiet', origin, 'alpha');
  run(root, 'init', '--quiet', 'beta');
  mkdirSync(join(root, 'notes'));
  writeFileSync(join(root, 'file.txt'), 'x');
  run(join(root, 'alpha'), 'worktree', 'add', '--quiet', '-b', 'feat/linked', join(root, 'linked'));
  return { root, origin, seed };
};

describe('Projects.layerGit', () => {
  it.live('lists the primary checkouts directly below the root', () =>
    Effect.gen(function* () {
      const { root } = projectsRoot();

      const listed = yield* ProjectsOutbound.use((outbound) => outbound.list).pipe(
        Effect.provide(layerGit({ root })),
      );

      expect(listed).toEqual([
        { name: 'alpha', path: join(root, 'alpha') },
        { name: 'beta', path: join(root, 'beta') },
      ]);
    }),
  );

  it.live('lists nothing for a missing root', () =>
    Effect.gen(function* () {
      const listed = yield* ProjectsOutbound.use((outbound) => outbound.list).pipe(
        Effect.provide(layerGit({ root: join(tmpdir(), 'no-such-projects-root') })),
      );

      expect(listed).toEqual([]);
    }),
  );

  it.live('fetches origin and names its default branch', () =>
    Effect.gen(function* () {
      const { root, seed } = projectsRoot();
      run(seed, 'push', '--quiet', 'origin', 'HEAD:feat/later');
      const alpha = { name: 'alpha', path: join(root, 'alpha') };

      const base = yield* ProjectsOutbound.use((outbound) => outbound.defaultBase(alpha)).pipe(
        Effect.provide(layerGit({ root })),
      );

      expect(base).toBe('origin/main');
      expect(run(alpha.path, 'branch', '--remotes')).toContain('origin/feat/later');
    }),
  );

  it.live('asks the remote for its default branch when origin/HEAD is not set', () =>
    Effect.gen(function* () {
      const { root, origin } = projectsRoot();
      const beta = { name: 'beta', path: join(root, 'beta') };
      run(beta.path, 'remote', 'add', 'origin', origin);

      const base = yield* ProjectsOutbound.use((outbound) => outbound.defaultBase(beta)).pipe(
        Effect.provide(layerGit({ root })),
      );

      expect(base).toBe('origin/main');
    }),
  );

  it.live('fails when origin cannot be fetched', () =>
    Effect.gen(function* () {
      const { root } = projectsRoot();
      const beta = { name: 'beta', path: join(root, 'beta') };

      const error = yield* ProjectsOutbound.use((outbound) => outbound.defaultBase(beta)).pipe(
        Effect.provide(layerGit({ root })),
        Effect.flip,
      );

      expect(error).toBeInstanceOf(ProjectGitError);
      expect(error.reason).toMatch(/^git fetch failed/u);
    }),
  );

  it.live('finds a branch locally or on origin', () =>
    Effect.gen(function* () {
      const { root } = projectsRoot();
      const alpha = { name: 'alpha', path: join(root, 'alpha') };

      const found = yield* ProjectsOutbound.use((outbound) =>
        Effect.all([
          outbound.branchExists(alpha, 'feat/taken'),
          outbound.branchExists(alpha, 'feat/linked'),
          outbound.branchExists(alpha, 'feat/free'),
        ]),
      ).pipe(Effect.provide(layerGit({ root })));

      expect(found).toEqual([true, true, false]);
    }),
  );

  it.live("checks a branch name with git's rule", () =>
    Effect.gen(function* () {
      const { root } = projectsRoot();
      const alpha = { name: 'alpha', path: join(root, 'alpha') };

      const valid = yield* ProjectsOutbound.use((outbound) =>
        Effect.all([
          outbound.isValidBranchName(alpha, 'feat/ok'),
          outbound.isValidBranchName(alpha, 'feat/a.lock'),
          outbound.isValidBranchName(alpha, 'feat/x..y'),
        ]),
      ).pipe(Effect.provide(layerGit({ root })));

      expect(valid).toEqual([true, false, false]);
    }),
  );
});
