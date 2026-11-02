import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import {
  AgentNotFoundError,
  HerdrRejectedError,
  NotAWorktreeError,
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

const removals = (state: FakeState['Service']) =>
  state.calls.filter((call) => call.method === 'removeWorktree');

describe('AgentsInbound.close', () => {
  it.effect('removes a clean worktree without force', () =>
    Effect.gen(function* () {
      const state = yield* arrange;

      yield* close('kirk');

      expect(removals(state)).toEqual([
        { method: 'removeWorktree', target: 'w2', params: { workspaceId: 'w2', force: false } },
      ]);
      expect(state.gitCalls).toContain('hasChanges app /worktrees/feature');
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
        { method: 'removeWorktree', target: 'w2', params: { workspaceId: 'w2', force: true } },
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

  it.effect("passes on Herdr's refusal", () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      state.rejects.set('w2', 'worktree_remove_failed');

      const error = yield* close('kirk').pipe(Effect.flip);

      expect(error).toBeInstanceOf(HerdrRejectedError);
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
