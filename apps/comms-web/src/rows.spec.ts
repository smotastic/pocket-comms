import { describe, expect, it } from 'vitest';
import { rowName, rowTag } from './rows.js';
import { fakeAgent } from './testing.js';

const main = fakeAgent({ name: 'kirk', workspace: 'pocket-home', project: 'pocket-home' });
const linked = fakeAgent({
  name: 'kirk',
  workspace: 'ingestor-mvp',
  project: 'pocket-home',
  worktree: 'ingestor-mvp',
});
const loose = fakeAgent({ name: 'burnham', workspace: 'G registry cleanup', project: undefined });

describe('rowName', () => {
  it('is the Herdr name of a named agent', () => {
    expect(rowName(main)).toBe('kirk');
  });

  it('is the workspace label of an agent without a name, not its pane id', () => {
    expect(rowName(fakeAgent({ name: undefined, paneId: 'w25:p1', workspace: 'feat-x' }))).toBe(
      'feat-x',
    );
  });
});

describe('rowTag', () => {
  it.each([
    ['a linked worktree', linked, 'pocket-home · ingestor-mvp'],
    ['a main checkout', main, 'pocket-home'],
    ['an agent without a project', loose, 'G registry cleanup'],
  ])('names the project and worktree of %s under Needs you', (_, agent, tag) => {
    expect(rowTag(agent, 'needsYou')).toBe(tag);
  });

  it('names only the worktree in a project card', () => {
    expect(rowTag(linked, 'project')).toBe('ingestor-mvp');
    expect(rowTag(main, 'project')).toBeUndefined();
  });

  it('names the workspace in the Other card', () => {
    expect(rowTag(loose, 'other')).toBe('G registry cleanup');
  });

  it('shows no tag that repeats the row name', () => {
    const unnamed = fakeAgent({ name: undefined, workspace: 'setup', project: undefined });
    expect(rowTag(unnamed, 'other')).toBeUndefined();
    expect(rowTag(unnamed, 'needsYou')).toBeUndefined();
    expect(
      rowTag(
        fakeAgent({ name: undefined, workspace: 'feat-x', project: 'app', worktree: 'feat-x' }),
        'project',
      ),
    ).toBeUndefined();
  });
});
