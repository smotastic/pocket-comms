import { describe, expect, it } from '@effect/vitest';
import {
  ACTIVITY_LIMIT,
  ACTIVITY_WINDOW_MS,
  activityBetween,
  activitySubject,
  isLiveIn,
  keepActivity,
  promptExcerpt,
  type ActivityEvent,
  type Observed,
} from './activity.js';
import type { Agent } from './agent.js';
import { OTHER_GROUP, type Workspace } from './workspace.js';

const agent = (overrides: Partial<Agent> & Pick<Agent, 'paneId'>): Agent => ({
  name: undefined,
  kind: 'claude',
  status: 'idle',
  title: 'A task',
  workspaceId: 'w1',
  cwd: '/work/app',
  session: undefined,
  completion: undefined,
  ...overrides,
});

const feature: Workspace = {
  id: 'w2',
  label: 'feature',
  group: { key: '/work/app/.git', name: 'app' },
  project: 'app',
  worktree: 'feature',
};

const observed = (overrides: Partial<Agent> & Pick<Agent, 'paneId'>): Observed => {
  const live = agent(overrides);
  return { agent: live, subject: activitySubject(live, feature) };
};

const event = (at: number, overrides: Partial<ActivityEvent> = {}): ActivityEvent =>
  ({
    id: `e${at}`,
    at,
    type: 'appeared',
    agent: observed({ paneId: 'w2:p1' }).subject,
    ...overrides,
  }) as ActivityEvent;

describe('activitySubject', () => {
  it('names the agent with its workspace, project and worktree', () => {
    expect(activitySubject(agent({ paneId: 'w2:p1', name: 'kirk' }), feature)).toEqual({
      paneId: 'w2:p1',
      ref: 'kirk',
      name: 'kirk',
      workspace: 'feature',
      project: 'app',
      worktree: 'feature',
    });
  });

  it('falls back to the workspace id and no project without a workspace', () => {
    expect(activitySubject(agent({ paneId: 'w3:p1', workspaceId: 'w3' }), undefined)).toEqual({
      paneId: 'w3:p1',
      ref: 'w3:p1',
      name: undefined,
      workspace: 'w3',
      project: undefined,
      worktree: undefined,
    });
  });

  it('has no project for a workspace without one', () => {
    const notes: Workspace = { id: 'w3', label: 'notes', group: OTHER_GROUP };
    expect(activitySubject(agent({ paneId: 'w3:p1' }), notes)).toMatchObject({
      workspace: 'notes',
      project: undefined,
    });
  });
});

describe('activityBetween', () => {
  const types = (before: ReadonlyArray<Observed>, after: ReadonlyArray<Observed>) =>
    activityBetween(before, after).map((change) =>
      change.type === 'status'
        ? `${change.agent.paneId} ${change.status}`
        : `${change.agent.paneId} ${change.type}`,
    );

  it('records nothing for unchanged agents', () => {
    const agents = [observed({ paneId: 'w2:p1', status: 'working' })];
    expect(activityBetween(agents, agents)).toEqual([]);
  });

  it('records gone, then new agents, then status changes', () => {
    expect(
      types(
        [observed({ paneId: 'w2:p1' }), observed({ paneId: 'w2:p2', status: 'working' })],
        [observed({ paneId: 'w2:p2', status: 'blocked' }), observed({ paneId: 'w2:p3' })],
      ),
    ).toEqual(['w2:p1 gone', 'w2:p3 appeared', 'w2:p2 blocked']);
  });

  it('keeps the subject a gone agent had', () => {
    const [gone] = activityBetween([observed({ paneId: 'w2:p1', name: 'kirk' })], []);
    expect(gone).toEqual({
      type: 'gone',
      agent: expect.objectContaining({ ref: 'kirk', project: 'app' }),
    });
  });

  it.each(['working', 'blocked', 'done'] as const)('records a change to %s', (status) => {
    expect(
      types(
        [observed({ paneId: 'w2:p1', status: 'idle' })],
        [observed({ paneId: 'w2:p1', status })],
      ),
    ).toEqual([`w2:p1 ${status}`]);
  });

  it.each(['idle', 'unknown'] as const)('skips a change to %s', (status) => {
    expect(
      types(
        [observed({ paneId: 'w2:p1', status: 'working' })],
        [observed({ paneId: 'w2:p1', status })],
      ),
    ).toEqual([]);
  });

  it('records another completion of an agent that stays done', () => {
    expect(
      types(
        [observed({ paneId: 'w2:p1', status: 'done', completion: 2 })],
        [observed({ paneId: 'w2:p1', status: 'done', completion: 3 })],
      ),
    ).toEqual(['w2:p1 done']);
  });

  it('uses the newer subject for a status change', () => {
    const [change] = activityBetween(
      [observed({ paneId: 'w2:p1' })],
      [observed({ paneId: 'w2:p1', name: 'kirk', status: 'working' })],
    );
    expect(change?.agent.ref).toBe('kirk');
  });
});

describe('keepActivity', () => {
  const now = 10 * ACTIVITY_WINDOW_MS;

  it('keeps the newest events up to the limit, oldest first', () => {
    const events = Array.from({ length: ACTIVITY_LIMIT + 20 }, (_, index) =>
      event(now - 1000 + index),
    );
    const kept = keepActivity(events, now);
    expect(kept).toHaveLength(ACTIVITY_LIMIT);
    expect(kept[0]?.at).toBe(now - 1000 + 20);
    expect(kept.at(-1)?.at).toBe(now - 1000 + ACTIVITY_LIMIT + 19);
  });

  it('drops events older than the window', () => {
    const kept = keepActivity(
      [event(now - ACTIVITY_WINDOW_MS - 1), event(now - ACTIVITY_WINDOW_MS + 1), event(now)],
      now,
    );
    expect(kept.map((kept) => kept.at)).toEqual([now - ACTIVITY_WINDOW_MS + 1, now]);
  });
});

describe('promptExcerpt', () => {
  it('takes the first line that says something', () => {
    expect(promptExcerpt('\n  \n  Fix the failing test\nand run it')).toBe('Fix the failing test');
  });

  it('collapses runs of white space', () => {
    expect(promptExcerpt('Fix\tthe   build')).toBe('Fix the build');
  });

  it('cuts a long line at 80 characters with an ellipsis', () => {
    const excerpt = promptExcerpt('a'.repeat(100));
    expect(excerpt).toHaveLength(80);
    expect(excerpt).toBe(`${'a'.repeat(79)}…`);
  });

  it('keeps a line of exactly 80 characters', () => {
    expect(promptExcerpt('b'.repeat(80))).toBe('b'.repeat(80));
  });

  it('is empty for a blank prompt', () => {
    expect(promptExcerpt('  \n ')).toBe('');
  });
});

describe('isLiveIn', () => {
  const subject = observed({ paneId: 'w2:p1', name: 'kirk' }).subject;

  it('is live while an agent with its pane and name runs', () => {
    expect(isLiveIn(subject, [agent({ paneId: 'w2:p1', name: 'kirk' })])).toBe(true);
  });

  it('is not live when the pane runs another agent', () => {
    expect(isLiveIn(subject, [agent({ paneId: 'w2:p1', name: 'spock' })])).toBe(false);
  });

  it('is not live when the pane is gone', () => {
    expect(isLiveIn(subject, [agent({ paneId: 'w2:p2', name: 'kirk' })])).toBe(false);
  });
});
