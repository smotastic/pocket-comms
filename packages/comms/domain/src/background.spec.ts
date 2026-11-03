import { describe, expect, it } from '@effect/vitest';
import { runningAt, type BackgroundItem } from './background.js';

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
