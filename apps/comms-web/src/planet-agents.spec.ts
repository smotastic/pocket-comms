import { describe, expect, it } from 'vitest';
import type { OverviewView } from './comms-client.js';
import { filterOverview } from './planet-agents.js';
import { fakeAgent } from './testing.js';

const home = fakeAgent({ ref: 'kirk', planet: 'pocket-home' });
const comms = fakeAgent({ ref: 'spock', planet: 'pocket-comms' });
const loose = fakeAgent({ ref: 'burnham', planet: undefined, workspace: 'notes' });
const waitingHome = fakeAgent({ ref: 'uhura', planet: 'pocket-home', status: 'blocked' });
const waitingLearning = fakeAgent({ ref: 'data', planet: 'pocket-learning', status: 'done' });
const waitingLoose = fakeAgent({ ref: 'pike', planet: undefined, status: 'blocked' });

const overview: OverviewView = {
  needsYou: [waitingHome, waitingLearning, waitingLoose],
  groups: [
    { key: '/home/.git', name: 'pocket-home', agents: [home] },
    { key: '/comms/.git', name: 'pocket-comms', agents: [comms] },
    { key: 'other', name: 'Other', agents: [loose] },
  ],
};

const refs = (filtered: OverviewView) => ({
  needsYou: filtered.needsYou.map((agent) => agent.ref),
  groups: filtered.groups.map((group) => group.name),
});

describe('filterOverview', () => {
  it("keeps only a planet's card and its agents in Needs you", () => {
    expect(refs(filterOverview(overview, 'pocket-home'))).toEqual({
      needsYou: ['uhura'],
      groups: ['pocket-home'],
    });
  });

  it('keeps nothing of Other for a repository named Other', () => {
    expect(refs(filterOverview(overview, 'Other'))).toEqual({ needsYou: [], groups: [] });
  });

  it('keeps Needs you alone for a planet whose only agents wait', () => {
    expect(refs(filterOverview(overview, 'pocket-learning'))).toEqual({
      needsYou: ['data'],
      groups: [],
    });
  });
});
