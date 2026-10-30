#!/usr/bin/env node
/**
 * One-time initialisation of a repository created from this template. Rewrites every project
 * identifier in place and deletes nothing — the checklist in TEMPLATE.md lists the manual steps
 * that follow.
 *
 * Usage:
 *   node tools/template/init.mjs --repo <owner>/<name> [--scope @app]
 *                                [--name <package name>] [--dry-run]
 *
 * Every identifier has one current value in `CURRENT`; the script replaces that value, so it can
 * be run again later with new flags.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const CURRENT = {
  repo: 'smotastic/pocket-comms',
  scope: '@pocket-comms',
  name: 'pocket-comms',
};
const VALUE_FLAGS = new Set(['--repo', '--scope', '--name']);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.nx', 'coverage']);
const TEXT_EXT = /\.(md|mjs|cjs|js|ts|tsx|json|yaml|yml|sh|py|toml|html)$/;

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    const value = argv[i + 1];
    if (!VALUE_FLAGS.has(flag) || value === undefined || value.startsWith('--')) {
      fail(`unexpected argument: ${flag}`);
    }
    out[flag.slice(2)] = value;
    i += 1;
  }
  return out;
}

function fail(message) {
  console.error(`\nError: ${message}\n`);
  console.error(
    'usage: node tools/template/init.mjs --repo <owner>/<name> [--scope @x] [--name <pkg>] [--dry-run]',
  );
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));
if (!args.repo || !/^[\w.-]+\/[\w.-]+$/.test(args.repo)) fail('--repo <owner>/<name> is required');
const next = {
  repo: args.repo,
  scope: args.scope ?? CURRENT.scope,
  name: args.name ?? CURRENT.name,
};
if (!/^@[a-z0-9-]+$/.test(next.scope)) fail('--scope must look like @name');

const root = process.cwd();
const self = join(root, 'tools', 'template', 'init.mjs');

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (
      TEXT_EXT.test(entry.name) ||
      entry.name === 'CODEOWNERS' ||
      entry.name === 'pre-push'
    ) {
      yield path;
    }
  }
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ownerOf = (repo) => repo.split('/')[0];
const scopeName = (scope) => scope.slice(1);

// Whole identifiers only, not parts of other names. The repository goes first, because its name
// can equal the package name.
const replacements = [
  [new RegExp(`\\b${escape(CURRENT.repo)}\\b`, 'g'), next.repo],
  [new RegExp(`${escape(CURRENT.scope)}(?=/|\\b)`, 'g'), next.scope],
  [new RegExp(`urn:${escape(scopeName(CURRENT.scope))}:`, 'g'), `urn:${scopeName(next.scope)}:`],
  [new RegExp(`\\b${escape(CURRENT.name)}\\b`, 'g'), next.name],
];
// The review owner in CODEOWNERS is the repository owner.
const codeowners = [
  new RegExp(`@${escape(ownerOf(CURRENT.repo))}\\b`, 'g'),
  `@${ownerOf(next.repo)}`,
];

let touched = 0;
for (const path of walk(root)) {
  if (path === self || statSync(path).size > 2_000_000) continue;
  const before = readFileSync(path, 'utf8');
  let after = before;
  for (const [pattern, value] of replacements) after = after.replace(pattern, value);
  if (path.endsWith('CODEOWNERS')) after = after.replace(...codeowners);
  if (after !== before) {
    touched += 1;
    console.log(`${args.dryRun ? 'would update' : 'updated'}  ${relative(root, path)}`);
    if (!args.dryRun) writeFileSync(path, after, 'utf8');
  }
}

if (!args.dryRun) {
  const selfSource = readFileSync(self, 'utf8').replace(
    /const CURRENT = \{[\s\S]*?\};/,
    `const CURRENT = {\n  repo: '${next.repo}',\n  scope: '${next.scope}',\n  name: '${next.name}',\n};`,
  );
  writeFileSync(self, selfSource, 'utf8');
}

console.log(
  `\n${args.dryRun ? 'Dry run: ' : ''}${touched} file(s) ${args.dryRun ? 'would change' : 'changed'}.` +
    `\n  repository ${next.repo}\n  scope      ${next.scope}\n  name       ${next.name}\n`,
);
console.log(
  'Next: follow the checklist in TEMPLATE.md, then run `pnpm install`, `pnpm format` and `pnpm verify:local`.\n',
);
