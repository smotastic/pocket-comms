import { describe, expect, it } from '@effect/vitest';
import type { Agent } from './agent.js';
import { afterRestart, deliveryOf, recoveryOf, startFor, type TaskStart } from './task-start.js';

const start = (overrides: Partial<TaskStart> = {}): TaskStart => ({
  folder: '/worktrees/fix-12-login',
  project: 'app',
  branch: 'fix/12-login',
  issue: 12,
  kind: 'claude',
  agent: 'fix-12-login',
  prompt: 'Fix the login\n\nCloses #12',
  delivery: 'not-sent',
  reason: undefined,
  at: 1,
  ...overrides,
});

const agent = (overrides: Partial<Agent> & Pick<Agent, 'paneId'>): Agent => ({
  name: undefined,
  kind: 'claude',
  status: 'idle',
  title: '',
  workspaceId: 'w1',
  cwd: '/worktrees/fix-12-login',
  session: undefined,
  completion: undefined,
  ...overrides,
});

describe('deliveryOf', () => {
  it('forgets nothing it cannot know: an unanswered prompt may have arrived', () => {
    expect(deliveryOf({ _tag: 'Accepted' })).toEqual({ delivery: 'delivered', reason: undefined });
    expect(deliveryOf({ _tag: 'Refused', reason: 'agent w1:p1 is not ready' })).toEqual({
      delivery: 'not-sent',
      reason: 'agent w1:p1 is not ready',
    });
    expect(deliveryOf({ _tag: 'Unanswered', reason: 'Herdr did not answer in time.' })).toEqual({
      delivery: 'uncertain',
      reason: 'Herdr did not answer in time.',
    });
  });
});

describe('afterRestart', () => {
  it('reads a start that was pending as uncertain, and keeps the others', () => {
    const starts = afterRestart([
      start({ folder: '/a', delivery: 'pending' }),
      start({ folder: '/b', delivery: 'not-sent' }),
    ]);

    expect(starts.map((each) => each.delivery)).toEqual(['uncertain', 'not-sent']);
  });
});

describe('startFor', () => {
  it("finds the start of the agent's worktree by its folder", () => {
    const kept = start();
    const one = agent({ paneId: 'w1:p1', cwd: '/worktrees/fix-12-login/packages' });

    expect(startFor([kept], one, [one])).toBe(kept);
  });

  it('does not take a folder that only begins with the same name', () => {
    const one = agent({ paneId: 'w1:p1', cwd: '/worktrees/fix-12-login-2' });

    expect(startFor([start()], one, [one])).toBeUndefined();
  });

  it('gives it only to the named agent when the worktree has several', () => {
    const kept = start();
    const named = agent({ paneId: 'w1:p1', name: 'fix-12-login' });
    const other = agent({ paneId: 'w1:p2', name: 'helper' });

    expect(startFor([kept], named, [named, other])).toBe(kept);
    expect(startFor([kept], other, [named, other])).toBeUndefined();
  });
});

describe('recoveryOf', () => {
  const folder = '/worktrees/fix-12-login';

  it('offers to start an agent in a worktree without one', () => {
    expect(recoveryOf({ path: folder, agents: [] }, undefined)).toBe('start-agent');
    expect(recoveryOf({ path: folder, agents: [] }, start({ delivery: 'not-started' }))).toBe(
      'start-agent',
    );
  });

  it('offers to resume an agent whose task was not delivered', () => {
    const agents = [agent({ paneId: 'w1:p1' })];

    expect(recoveryOf({ path: folder, agents }, start())).toBe('resume');
    expect(recoveryOf({ path: folder, agents }, start({ delivery: 'uncertain' }))).toBe('resume');
  });

  it('offers the issue task to an agent without a kept start', () => {
    const agents = [agent({ paneId: 'w1:p1' })];

    expect(recoveryOf({ path: folder, agents }, undefined)).toBe('send-issue-task');
  });

  it('offers nothing while a start runs', () => {
    expect(
      recoveryOf({ path: folder, agents: [] }, start({ delivery: 'pending' })),
    ).toBeUndefined();
  });
});
