import { describe, expect, it } from '@effect/vitest';
import * as Result from 'effect/Result';
import { InvalidInputError } from './errors.js';
import {
  agentNameFor,
  MAX_BRANCH_LENGTH,
  orderProjects,
  parseAgentToStart,
  parseBranch,
  parseTask,
} from './task.js';
import type { Workspace } from './workspace.js';

const workspace = (id: string, root?: string): Workspace => ({
  id,
  label: id,
  group: { key: `ws:${id}`, name: id },
  ...(root === undefined ? {} : { root }),
});

describe('orderProjects', () => {
  it('puts the projects open in Herdr first, in workspace order, then the rest by name', () => {
    const projects = [
      { name: 'beta', path: '/p/beta' },
      { name: 'gamma', path: '/p/gamma' },
      { name: 'alpha', path: '/p/alpha' },
      { name: 'delta', path: '/p/delta' },
    ];
    const workspaces = [
      workspace('w1', '/p/delta'),
      workspace('w2'),
      workspace('w3', '/p/gamma'),
      workspace('w4', '/p/delta'),
      workspace('w5', '/elsewhere/zeta'),
    ];

    expect(orderProjects(projects, workspaces)).toEqual([
      { name: 'delta', path: '/p/delta', open: true },
      { name: 'gamma', path: '/p/gamma', open: true },
      { name: 'alpha', path: '/p/alpha', open: false },
      { name: 'beta', path: '/p/beta', open: false },
    ]);
  });
});

describe('parseTask', () => {
  it('trims the text and takes its first non-blank line as the title', () => {
    expect(parseTask('\n  Fix the login redirect \nIt loops on Safari.\n')).toEqual(
      Result.succeed({
        text: 'Fix the login redirect \nIt loops on Safari.',
        title: 'Fix the login redirect',
      }),
    );
  });

  it('cuts a long title to 80 characters', () => {
    const parsed = parseTask('x'.repeat(100));
    expect(Result.isSuccess(parsed) && parsed.success.title).toBe('x'.repeat(80));
  });

  it.each(['', ' \n '])('rejects the blank task %j', (text) => {
    expect(parseTask(text)).toEqual(
      Result.fail(
        new InvalidInputError({ issues: [{ field: 'task', message: 'Describe the task first.' }] }),
      ),
    );
  });

  it('rejects a task longer than the limit', () => {
    expect(Result.isFailure(parseTask('x'.repeat(20_001)))).toBe(true);
  });
});

describe('parseBranch', () => {
  it.each([
    'feat/new-task-flow',
    'fix/login',
    'chore/a1',
    'docs/x',
    'refactor/a-b-c',
    'test/t',
    'ci/c',
    'build/b',
  ])('accepts %s', (branch) => {
    expect(parseBranch(branch)).toEqual(Result.succeed(branch));
  });

  it.each([
    'Feature/Foo',
    'feat/Foo',
    'feat/foo..bar',
    'wip/foo',
    'feat/',
    'feat/foo--bar',
    'feat/-foo',
    'feat/foo-',
    'feat/foo/bar',
    'feat/foo bar',
    'foo',
    `feat/${'a'.repeat(MAX_BRANCH_LENGTH)}`,
  ])('rejects %j', (branch) => {
    expect(parseBranch(branch)).toEqual(
      Result.fail(
        new InvalidInputError({
          issues: [
            {
              field: 'branch',
              message:
                'Name the branch <type>/<kebab-description>, such as feat/new-task, with a type of feat, fix, chore, docs, refactor, test, ci or build.',
            },
          ],
        }),
      ),
    );
  });
});

describe('parseAgentToStart', () => {
  it.each(['claude', 'pi'])('accepts %s', (kind) => {
    expect(parseAgentToStart(kind)).toEqual(Result.succeed(kind));
  });

  it('rejects another kind', () => {
    expect(Result.isFailure(parseAgentToStart('codex'))).toBe(true);
  });
});

describe('agentNameFor', () => {
  it('names the agent after the branch', () => {
    expect(agentNameFor('feat/new-task', new Set(['kirk']))).toBe('feat-new-task');
  });

  it('adds a number when a live agent has the name', () => {
    expect(agentNameFor('feat/new-task', new Set(['feat-new-task', 'feat-new-task-2']))).toBe(
      'feat-new-task-3',
    );
  });

  it('shortens a long branch to the 32 characters Herdr allows', () => {
    expect(agentNameFor('feat/49-alert-when-the-mac-s-own-disk-fills', new Set())).toBe(
      'feat-49-alert-when-the-mac-s-own',
    );
  });

  it('keeps the number within 32 characters', () => {
    expect(
      agentNameFor(
        'feat/49-alert-when-the-mac-s-own-disk-fills',
        new Set(['feat-49-alert-when-the-mac-s-own']),
      ),
    ).toBe('feat-49-alert-when-the-mac-s-o-2');
  });

  it('drops a trailing dash left by shortening', () => {
    expect(agentNameFor('feat/49-alert-when-the-mac-ssss-own-disk', new Set())).toBe(
      'feat-49-alert-when-the-mac-ssss',
    );
  });
});
