#!/usr/bin/env node
/**
 * Validates branch names, commit subjects and pull request titles. Anchors both ends against the
 * subject line only, which is what lets it enforce "no trailing period" — the one rule a GitHub
 * ruleset cannot express, because it matches the whole message and `$` there would forbid a body.
 *
 * Usage: validate.mjs [--branch [name]] [--commit <file|-|message>] [--unpushed] [--title <text>]
 *        with no argument: the current branch name and the HEAD subject.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { BRANCH_NAME_PATTERN, COMMIT_SUBJECT_PATTERN, SUBJECT_PATTERN } from './patterns.mjs';

const DOCUMENT = 'docs/engineering/git-and-pr-conventions.md';

const RULES = {
  branch: {
    label: 'branch name',
    pattern: BRANCH_NAME_PATTERN,
    shape: '<type>/<kebab-case-description>',
    example: 'chore/update-convention-checks',
    section: '§2',
  },
  commit: {
    label: 'commit subject',
    pattern: COMMIT_SUBJECT_PATTERN,
    shape: '<type>(optional-scope): <description>',
    example: 'fix(catalog): reject duplicate item IDs',
    section: '§2',
  },
  title: {
    label: 'pull request title',
    pattern: SUBJECT_PATTERN,
    shape: '<type>(optional-scope): <description>',
    example: 'docs: update Git and PR conventions',
    section: '§2',
  },
};

/** `master` cannot match a `<type>/…` shape, and the Copilot agent names its own branches. */
const BRANCH_EXEMPTIONS = [/^master$/, /^copilot\//];

const violations = [];
const checked = [];

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * What git's `%s` will report: the first paragraph folded to one line. Taking the first physical
 * line instead would bless a message whose real subject — the folded paragraph — ends in a period.
 */
function subjectOf(message) {
  const [paragraph] = message.split(/\n\s*\n/, 1);
  return paragraph.split('\n').join(' ').trim();
}

function judge(ruleName, text, origin) {
  const rule = RULES[ruleName];
  if (new RegExp(`^${rule.pattern}$`).test(text)) {
    return;
  }
  violations.push({ rule, text, origin });
}

function report() {
  for (const { rule, text, origin } of violations) {
    process.stderr.write(
      [
        `✖ ${rule.label} does not follow the convention${origin === undefined ? '' : ` (${origin})`}`,
        `    offending:  ${text}`,
        `    expected:   ${rule.shape}`,
        `    example:    ${rule.example}`,
        `    see:        ${DOCUMENT} ${rule.section}`,
        '',
      ].join('\n'),
    );
  }
}

function currentBranch() {
  // A detached HEAD has no branch name to judge — during a rebase, for instance.
  const name = git('rev-parse', '--abbrev-ref', 'HEAD');
  return name === 'HEAD' ? undefined : name;
}

function validateBranch(name) {
  const branch = name ?? currentBranch();
  if (branch === undefined || BRANCH_EXEMPTIONS.some((exemption) => exemption.test(branch))) {
    return;
  }
  checked.push('the branch name');
  judge('branch', branch, undefined);
}

function validateCommitMessage(source) {
  const message =
    source === '-'
      ? readFileSync(0, 'utf-8')
      : existsSync(source)
        ? readFileSync(source, 'utf-8')
        : source;
  checked.push('one commit subject');
  judge('commit', subjectOf(message), undefined);
}

/**
 * The commits this push introduces and nothing else: `--not --remotes=origin` excludes anything
 * already on an `origin/*` ref, and touches no network because `--remotes` reads local refs.
 */
function validateUnpushed() {
  const range = git('log', '--no-merges', '--format=%h %s', 'HEAD', '--not', '--remotes=origin');
  const lines = range === '' ? [] : range.split('\n');
  checked.push(`${lines.length} unpushed commit subject${lines.length === 1 ? '' : 's'}`);
  for (const line of lines) {
    const separator = line.indexOf(' ');
    judge('commit', line.slice(separator + 1), line.slice(0, separator));
  }
}

function validateHeadSubject() {
  checked.push('the HEAD subject');
  judge('commit', git('log', '-1', '--format=%s'), 'HEAD');
}

function usage(message) {
  process.stderr.write(
    `${message}\nusage: validate.mjs [--branch [name]] [--commit <file|-|message>] [--unpushed] [--title <text>]\n`,
  );
  process.exit(2);
}

function main() {
  const argv = process.argv.slice(2);
  let sawMode = false;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    const hasValue = value !== undefined && !value.startsWith('--');

    switch (flag) {
      // The only flag whose value is optional: the pre-push hook passes a bare `--branch`.
      case '--branch': {
        if (hasValue) {
          index += 1;
        }
        validateBranch(hasValue ? value : undefined);
        break;
      }
      case '--commit':
        if (!hasValue) usage('--commit needs a file, - or a message');
        index += 1;
        validateCommitMessage(value);
        break;
      case '--unpushed':
        validateUnpushed();
        break;
      case '--title':
        if (!hasValue) usage('--title needs a text');
        index += 1;
        checked.push('the pull request title');
        judge('title', subjectOf(value), undefined);
        break;
      default:
        usage(`unknown argument: ${flag}`);
    }
    sawMode = true;
  }

  if (!sawMode) {
    validateBranch(undefined);
    validateHeadSubject();
  }

  if (violations.length > 0) {
    report();
    process.exit(1);
  }

  process.stdout.write(`✔ convention check passed: ${checked.join(', ')}\n`);
}

try {
  main();
} catch (error) {
  // Exit 2, never 1: an unreadable file or a repository without commits is not a convention
  // verdict, and a caller branching on the exit code must be able to tell the two apart.
  process.stderr.write(`✖ validate.mjs could not run: ${error.message ?? error}\n`);
  process.exit(2);
}
