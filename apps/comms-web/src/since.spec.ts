import { describe, expect, it } from 'vitest';
import { since } from './since.js';

describe('since', () => {
  it.each([
    [0, 'now'],
    [4_999, 'now'],
    [12_000, '12s'],
    [4 * 60_000, '4m'],
    [2 * 3_600_000, '2h'],
    [3 * 86_400_000, '3d'],
  ])('shows %i ms ago as %s', (ago, text) => {
    expect(since(1_000_000_000 - ago, 1_000_000_000)).toBe(text);
  });

  it('shows a moment slightly in the future as now', () => {
    expect(since(1_001, 1_000)).toBe('now');
  });
});
