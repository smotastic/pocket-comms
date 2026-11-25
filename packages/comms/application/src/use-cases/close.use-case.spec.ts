import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import {
  AgentNotFoundError,
  MultiplexerRejectedError,
  NotAWorktreeError,
  ProjectGitError,
  WorktreeHasChangesError,
} from '../errors.js';
import { AgentsInbound } from '../ports/agents.inbound.port.js';
import { fakeAgent, fakeLayer, FakeState } from '../testing/fakes.js';

const layer = () => AgentsInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const close = (ref: string, force = false) =>
  AgentsInbound.use((inbound) => inbound.close(ref, force));

// `kirk` works in the linked worktree `feature` of `app` (workspace `w2`, `/worktrees/feature`).
const arrange = Effect.gen(function* () {
  const state = yield* FakeState;
  state.agents = [
    fakeAgent({ paneId: 'w1:p1', name: 'spock' }),
    fakeAgent({ paneId: 'w2:p1', name: 'kirk', workspaceId: 'w2', cwd: '/worktrees/feature' }),
    fakeAgent({ paneId: 'w3:p1', name: 'uhura', workspaceId: 'w3', cwd: '/notes' }),
  ];
  state.worktrees.set('app', [
    { path: '/work/app', branch: 'master' },
    { path: '/worktrees/feature', branch: 'feat/feature' },
  ]);
  return state;
});

// What closing did: git's removals of a worktree, then the multiplexer's closed workspaces.
const removals = (state: FakeState['Service']) => [
  ...state.gitCalls.filter((call) => call.startsWith('removeWorktree')),
  ...state.calls.filter((call) => call.method === 'closeWorkspace'),
];

describe('AgentsInbound.close', () => {
  it.effect('removes a clean worktree without force', () =>
    Effect.gen(function* () {
      const state = yield* arrange;

      yield* close('kirk');

      expect(removals(state)).toEqual([
        'removeWorktree app /worktrees/feature force=false',
        { method: 'closeWorkspace', target: 'w2' },
      ]);
      expect(state.gitCalls).toContain('hasChanges app /worktrees/feature');
    }).pipe(Effect.provide(layer())),
  );

  it.effect("forgets the worktree's task start once it is removed, and only then", () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      const start = {
        folder: '/worktrees/feature',
        project: 'app',
        branch: 'feat/feature',
        issue: undefined,
        kind: 'claude' as const,
        agent: 'kirk',
        prompt: 'Do it',
        delivery: 'not-sent' as const,
        reason: undefined,
        at: 1,
      };
      state.taskStarts.set(start.folder, start);
      state.changed.add('/worktrees/feature');

      yield* close('kirk').pipe(Effect.flip);
      expect(state.taskStarts.has(start.folder)).toBe(true);

      yield* close('kirk', true);
      expect(state.taskStarts.has(start.folder)).toBe(false);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('removes nothing when the worktree has changes', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      state.changed.add('/worktrees/feature');

      const error = yield* close('kirk').pipe(Effect.flip);

      expect(error).toEqual(new WorktreeHasChangesError({ ref: 'kirk' }));
      expect(removals(state)).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('removes a worktree with changes when forced, without asking git', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      state.changed.add('/worktrees/feature');

      yield* close('kirk', true);

      expect(removals(state)).toEqual([
        'removeWorktree app /worktrees/feature force=true',
        { method: 'closeWorkspace', target: 'w2' },
      ]);
      expect(state.gitCalls.some((call) => call.startsWith('hasChanges'))).toBe(false);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses an agent in a main checkout', () =>
    Effect.gen(function* () {
      const state = yield* arrange;

      const error = yield* close('spock', true).pipe(Effect.flip);

      expect(error).toEqual(new NotAWorktreeError({ ref: 'spock' }));
      expect(removals(state)).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses a workspace Herdr does not report as a linked worktree', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      // git lists the checkout as linked, but Herdr does not call the workspace a worktree.
      state.workspaces = state.workspaces.map((workspace) => {
        if (workspace.id !== 'w2') return workspace;
        const { worktree: _worktree, ...rest } = workspace;
        return rest;
      });

      const error = yield* close('kirk', true).pipe(Effect.flip);

      expect(error).toEqual(new NotAWorktreeError({ ref: 'kirk' }));
      expect(removals(state)).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses an agent in a workspace without a repository', () =>
    Effect.gen(function* () {
      const state = yield* arrange;

      const error = yield* close('uhura', true).pipe(Effect.flip);

      expect(error).toEqual(new NotAWorktreeError({ ref: 'uhura' }));
      expect(removals(state)).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses a worktree whose project is not below the projects root', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      state.projects = [];

      const error = yield* close('kirk', true).pipe(Effect.flip);

      expect(error).toEqual(new NotAWorktreeError({ ref: 'kirk' }));
      expect(removals(state)).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses a checkout that git lists as no linked worktree', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      state.worktrees.set('app', [{ path: '/worktrees/feature', branch: 'feat/feature' }]);

      const error = yield* close('kirk', true).pipe(Effect.flip);

      expect(error).toEqual(new NotAWorktreeError({ ref: 'kirk' }));
      expect(removals(state)).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect("passes on git's refusal to remove, and keeps the workspace open", () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      state.refusedRemovals.add('/worktrees/feature');

      const error = yield* close('kirk', true).pipe(Effect.flip);

      expect(error).toBeInstanceOf(ProjectGitError);
      expect(state.calls.filter((call) => call.method === 'closeWorkspace')).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect("passes on the multiplexer's refusal to close the workspace", () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      state.rejects.set('w2', 'workspace_not_found');

      const error = yield* close('kirk').pipe(Effect.flip);

      expect(error).toBeInstanceOf(MultiplexerRejectedError);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reports an unknown agent as not found', () =>
    Effect.gen(function* () {
      yield* arrange;

      const error = yield* close('nobody').pipe(Effect.flip);

      expect(error).toEqual(new AgentNotFoundError({ ref: 'nobody' }));
    }).pipe(Effect.provide(layer())),
  );
});
