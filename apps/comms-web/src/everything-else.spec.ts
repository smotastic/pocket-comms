import { describe, expect, it } from 'vitest';
import { activeFilter, agentsOf, ALL } from './everything-else.js';
import { fakeAgent } from './testing.js';

const comms = fakeAgent({ ref: 'a', project: 'pocket-comms' });
const home = fakeAgent({ ref: 'b', project: 'pocket-home' });
const loose = fakeAgent({ ref: 'c', project: undefined });
const groups = [
  { key: '/comms/.git', name: 'pocket-comms', agents: [comms] },
  { key: '/home/.git', name: 'pocket-home', agents: [home] },
  { key: 'other', name: 'Other', agents: [loose] },
];

describe('agentsOf', () => {
  it('lists every group in order', () => {
    expect(agentsOf(groups)).toEqual([comms, home, loose]);
  });

  it('narrows to the chosen group', () => {
    expect(agentsOf(groups, '/home/.git')).toEqual([home]);
  });
});

describe('activeFilter', () => {
  it('keeps a chosen group that is still there', () => {
    expect(activeFilter(groups, 'other')).toBe('other');
  });

  it('returns to All when the chosen group is gone', () => {
    expect(activeFilter(groups.slice(0, 2), 'other')).toBe(ALL);
  });
});
