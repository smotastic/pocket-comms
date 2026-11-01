import { describe, expect, it } from 'vitest';
import type { OverviewView } from './comms-client.js';
import { filterOverview, OTHER_CHOICE, projectChoices } from './project-filter.js';
import { fakeAgent } from './testing.js';

const home = fakeAgent({ ref: 'kirk', project: 'pocket-home' });
const comms = fakeAgent({ ref: 'spock', project: 'pocket-comms' });
const loose = fakeAgent({ ref: 'burnham', project: undefined, workspace: 'notes' });
const waitingHome = fakeAgent({ ref: 'uhura', project: 'pocket-home', status: 'blocked' });
const waitingLearning = fakeAgent({ ref: 'data', project: 'pocket-learning', status: 'done' });
const waitingLoose = fakeAgent({ ref: 'pike', project: undefined, status: 'blocked' });

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

describe('projectChoices', () => {
  it('lists every project with an agent in card order, those only in Needs you next, Other last', () => {
    expect(projectChoices(overview)).toEqual([
      { value: 'pocket-home', label: 'pocket-home', count: 2, waiting: true },
      { value: 'pocket-comms', label: 'pocket-comms', count: 1, waiting: false },
      { value: 'pocket-learning', label: 'pocket-learning', count: 1, waiting: true },
      { value: OTHER_CHOICE, label: 'Other', count: 2, waiting: true },
    ]);
  });

  it('keeps a repository named other apart from the agents without a project', () => {
    const named = fakeAgent({ ref: 'scotty', project: 'other' });
    expect(
      projectChoices({
        needsYou: [],
        groups: [
          { key: '/other/.git', name: 'other', agents: [named] },
          { key: 'other', name: 'Other', agents: [loose] },
        ],
      }).map((choice) => [choice.value, choice.label]),
    ).toEqual([
      ['other', 'other'],
      [OTHER_CHOICE, 'Other'],
    ]);
  });

  it('lists nothing without agents', () => {
    expect(projectChoices({ needsYou: [], groups: [] })).toEqual([]);
  });
});

describe('filterOverview', () => {
  it('keeps everything for all projects', () => {
    expect(filterOverview(overview, undefined)).toBe(overview);
  });

  it("keeps only a project's card and its agents in Needs you", () => {
    expect(refs(filterOverview(overview, 'pocket-home'))).toEqual({
      needsYou: ['uhura'],
      groups: ['pocket-home'],
    });
  });

  it('keeps only the Other card and the agents without a project for Other', () => {
    expect(refs(filterOverview(overview, OTHER_CHOICE))).toEqual({
      needsYou: ['pike'],
      groups: ['Other'],
    });
  });

  it('keeps Needs you alone for a project whose only agents wait', () => {
    expect(refs(filterOverview(overview, 'pocket-learning'))).toEqual({
      needsYou: ['data'],
      groups: [],
    });
  });
});
