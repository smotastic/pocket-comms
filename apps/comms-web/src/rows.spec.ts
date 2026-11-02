import { describe, expect, it } from 'vitest';
import { projectHue, projectLabel, rowName, rowWorktree } from './rows.js';
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

describe('rowWorktree', () => {
  it('is the worktree of a linked worktree', () => {
    expect(rowWorktree(linked)).toBe('ingestor-mvp');
  });

  it('is none for a main checkout', () => {
    expect(rowWorktree(main)).toBeUndefined();
  });

  it('is none when it repeats the row name', () => {
    expect(
      rowWorktree(fakeAgent({ name: undefined, workspace: 'feat-x', worktree: 'feat-x' })),
    ).toBeUndefined();
  });
});

describe('projectLabel', () => {
  it('is the project of an agent', () => {
    expect(projectLabel(linked)).toBe('pocket-home');
  });

  it('is the workspace of an agent without a project', () => {
    expect(projectLabel(loose)).toBe('G registry cleanup');
  });
});

describe('projectHue', () => {
  const projects = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('takes the colours in the order of the projects', () => {
    expect(projectHue('a', projects)).toBe(1);
    expect(projectHue('e', projects)).toBe(5);
  });

  it('starts again after the last colour', () => {
    expect(projectHue('f', projects)).toBe(1);
  });

  it('is neutral for a project outside the list and for no project', () => {
    expect(projectHue('elsewhere', projects)).toBe('neutral');
    expect(projectHue(undefined, projects)).toBe('neutral');
  });
});
