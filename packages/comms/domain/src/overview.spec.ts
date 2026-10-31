import { describe, expect, it } from '@effect/vitest';
import type { Agent } from './agent.js';
import { agentRef, completionKey, transcriptFormatOf } from './agent.js';
import { buildOverview } from './overview.js';
import type { Workspace } from './workspace.js';

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

const workspaces: ReadonlyArray<Workspace> = [
  { id: 'w1', label: 'app', group: { key: '/work/app/.git', name: 'app' } },
  { id: 'w2', label: 'feature', group: { key: '/work/app/.git', name: 'app' } },
  { id: 'w3', label: 'notes', group: { key: 'ws:w3', name: 'notes' } },
];

const none = new Set<string>();

describe('agentRef', () => {
  it('is the Herdr name of a named agent', () => {
    expect(agentRef(agent({ paneId: 'w1:p1', name: 'kirk' }))).toBe('kirk');
  });

  it('is the pane id of an agent without a name', () => {
    expect(agentRef(agent({ paneId: 'w1:p1' }))).toBe('w1:p1');
  });
});

describe('buildOverview', () => {
  it('groups the agents of a repository and its worktree workspaces together', () => {
    const overview = buildOverview(
      [
        agent({ paneId: 'w1:p1' }),
        agent({ paneId: 'w3:p1', workspaceId: 'w3' }),
        agent({ paneId: 'w2:p1', workspaceId: 'w2' }),
      ],
      workspaces,
      none,
    );

    expect(overview.groups.map((group) => [group.name, group.agents.map((a) => a.paneId)])).toEqual(
      [
        ['app', ['w1:p1', 'w2:p1']],
        ['notes', ['w3:p1']],
      ],
    );
  });

  it('keeps the workspace order of Herdr for the groups', () => {
    const overview = buildOverview(
      [agent({ paneId: 'w3:p1', workspaceId: 'w3' }), agent({ paneId: 'w1:p1' })],
      workspaces,
      none,
    );

    expect(overview.groups.map((group) => group.name)).toEqual(['app', 'notes']);
  });

  it('puts an agent of an unknown workspace into a group of its own, after the known ones', () => {
    const overview = buildOverview(
      [agent({ paneId: 'w9:p1', workspaceId: 'w9' }), agent({ paneId: 'w1:p1' })],
      workspaces,
      none,
    );

    expect(overview.groups.map((group) => [group.key, group.name])).toEqual([
      ['/work/app/.git', 'app'],
      ['ws:w9', 'w9'],
    ]);
  });

  it('lists blocked agents and unseen done agents under Needs you, blocked first', () => {
    const overview = buildOverview(
      [
        agent({ paneId: 'w1:p1', status: 'done', completion: 4 }),
        agent({ paneId: 'w1:p2', status: 'working' }),
        agent({ paneId: 'w2:p1', workspaceId: 'w2', status: 'blocked' }),
      ],
      workspaces,
      none,
    );

    expect(overview.needsYou.map((a) => a.paneId)).toEqual(['w2:p1', 'w1:p1']);
    expect(overview.groups.map((group) => group.agents.map((a) => a.paneId))).toEqual([['w1:p2']]);
  });

  it('lists a done agent in its group once its completion was seen', () => {
    const done = agent({ paneId: 'w1:p1', status: 'done', completion: 4 });

    const overview = buildOverview([done], workspaces, new Set([completionKey(done)]));

    expect(overview.needsYou).toEqual([]);
    expect(overview.groups[0]?.agents).toEqual([done]);
  });

  it('lists a done agent under Needs you again after a new completion', () => {
    const seen = new Set([completionKey(agent({ paneId: 'w1:p1', completion: 4 }))]);

    const overview = buildOverview(
      [agent({ paneId: 'w1:p1', status: 'done', completion: 5 })],
      workspaces,
      seen,
    );

    expect(overview.needsYou.map((a) => a.paneId)).toEqual(['w1:p1']);
  });

  it('omits groups that have no agent left', () => {
    const overview = buildOverview(
      [agent({ paneId: 'w3:p1', workspaceId: 'w3', status: 'blocked' })],
      workspaces,
      none,
    );

    expect(overview.groups).toEqual([]);
  });
});

describe('transcriptFormatOf', () => {
  it.each([
    ['claude', 'claude'],
    ['pi', 'pi'],
    ['codex', undefined],
    [undefined, undefined],
  ] as const)('reads the session of a %s agent as %s', (kind, format) => {
    expect(transcriptFormatOf(agent({ paneId: 'w1:p1', kind }))).toBe(format);
  });
});
