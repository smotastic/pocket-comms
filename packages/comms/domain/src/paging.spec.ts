import { describe, expect, it } from '@effect/vitest';
import type { Agent } from './agent.js';
import { pagedAwayAfter, whilePagedAway } from './paging.js';

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  paneId: 'w1:p1',
  name: 'kirk',
  kind: 'claude',
  status: 'blocked',
  title: 'A task',
  workspaceId: 'w1',
  cwd: '/work',
  session: 's-1',
  completion: undefined,
  ...overrides,
});

describe('pagedAwayAfter', () => {
  it('starts with Page Up on a waiting agent', () => {
    expect(pagedAwayAfter(['pageup'], agent(), false)).toBe(true);
    expect(pagedAwayAfter(['pageup', 'pageup'], agent(), false)).toBe(true);
  });

  it('does not start with Page Down, nor on an agent that does not wait', () => {
    expect(pagedAwayAfter(['pagedown'], agent(), false)).toBe(false);
    expect(pagedAwayAfter(['pageup'], agent({ status: 'idle' }), false)).toBe(false);
    expect(pagedAwayAfter(['pageup'], agent({ status: 'done' }), false)).toBe(false);
    expect(pagedAwayAfter(['pageup'], undefined, false)).toBe(false);
  });

  it('lasts while the owner pages, whatever Herdr reports', () => {
    expect(pagedAwayAfter(['pagedown'], agent({ status: 'blocked' }), true)).toBe(true);
    expect(pagedAwayAfter(['pageup'], agent({ status: 'done' }), true)).toBe(true);
  });

  it('ends with any other key, such as an answer or Escape', () => {
    expect(pagedAwayAfter(['esc'], agent(), true)).toBe(false);
    expect(pagedAwayAfter(['pageup', '1'], agent(), false)).toBe(false);
  });
});

describe('whilePagedAway', () => {
  const waiting = agent({ completion: 7 });

  it('keeps a done or idle agent waiting as it was, for Herdr misreads the hidden question', () => {
    const paged = agent({ status: 'done', completion: 8, title: 'Newer title' });
    expect(whilePagedAway(paged, waiting)).toEqual({
      agent: { ...paged, status: 'blocked', completion: 7 },
      pagedAway: true,
    });
    expect(whilePagedAway(agent({ status: 'idle', completion: 8 }), waiting)).toMatchObject({
      agent: { status: 'blocked', completion: 7 },
      pagedAway: true,
    });
  });

  it('ends once Herdr reports another status, such as the question back in view', () => {
    for (const status of ['blocked', 'working', 'unknown'] as const) {
      const current = agent({ status, completion: 9 });
      expect(whilePagedAway(current, waiting)).toEqual({ agent: current, pagedAway: false });
    }
  });
});
