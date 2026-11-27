import { describe, expect, it } from '@effect/vitest';
import { isStale, runningAt, STALE_SUBAGENT_MS, type BackgroundItem } from './background.js';

const item = (overrides: Partial<BackgroundItem> & Pick<BackgroundItem, 'id'>): BackgroundItem => ({
  kind: 'shell',
  description: 'Wait for CI',
  startedAt: 1_000,
  inBackground: true,
  ...overrides,
});

describe('runningAt', () => {
  it('lists the items oldest first', () => {
    const items = [
      item({ id: 'b', startedAt: 3_000 }),
      item({ id: 'a', startedAt: 1_000 }),
      item({ id: 'c', startedAt: 2_000 }),
    ];

    expect(runningAt(items, 5_000).map((running) => running.id)).toEqual(['a', 'c', 'b']);
  });

  it('drops a monitor once its expiry has passed', () => {
    const monitor = item({ id: 'm', kind: 'monitor', expiresAt: 10_000 });

    expect(runningAt([monitor], 9_999)).toEqual([monitor]);
    expect(runningAt([monitor], 10_000)).toEqual([]);
  });

  it('keeps a shell without an expiry however long it runs', () => {
    const shell = item({ id: 's' });

    expect(runningAt([shell], Number.MAX_SAFE_INTEGER)).toEqual([shell]);
  });
});

describe('isStale', () => {
  it('keeps a subagent whose latest entry is within the limit', () => {
    expect(isStale(1_000, 1_000 + STALE_SUBAGENT_MS)).toBe(false);
  });

  it('ends a subagent with no new entry for longer than the limit', () => {
    expect(isStale(1_000, 1_001 + STALE_SUBAGENT_MS)).toBe(true);
  });

  it('allows a few hours of silence', () => {
    expect(STALE_SUBAGENT_MS).toBe(3 * 60 * 60_000);
  });
});
