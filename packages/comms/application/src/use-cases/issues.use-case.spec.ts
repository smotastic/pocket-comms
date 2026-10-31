import { describe, expect, it } from '@effect/vitest';
import { issueTask } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { ImplementIssueInput } from '../dto/issue.dto.js';
import {
  GiteaNotConfiguredError,
  GiteaUnavailableError,
  IssueClosedError,
  IssueNotFoundError,
  NoGiteaRemoteError,
  ProjectNotFoundError,
} from '../errors.js';
import { IssuesInbound } from '../ports/issues.inbound.port.js';
import { fakeAgent, fakeIssue, fakeLayer, FakeState } from '../testing/fakes.js';

const layer = () => IssuesInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const issues = (project = 'app') => IssuesInbound.use((inbound) => inbound.issues(project));

const implement = (input: Partial<ImplementIssueInput> = {}) =>
  IssuesInbound.use((inbound) =>
    inbound.implement({ project: 'app', number: 8, branch: 'feat/8-issue-list', ...input }),
  );

describe('IssuesInbound.issues', () => {
  it.effect('lists the open issues, newest activity first, with their suggested branch', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.issues.set('owner/app', [
        fakeIssue({ number: 3, title: 'Login breaks', labels: ['bug', 'ui'], updatedAt: 100 }),
        fakeIssue({ number: 4, title: 'A pull request', updatedAt: 300, pull: true }),
        fakeIssue({ number: 5, title: 'feat: dark mode', updatedAt: 200 }),
      ]);

      const list = yield* issues();

      expect(list).toEqual({
        _tag: 'Listed',
        repository: { owner: 'owner', name: 'app', url: 'http://gitea.test/owner/app' },
        issues: [
          {
            number: 5,
            title: 'feat: dark mode',
            labels: [],
            updatedAt: 200,
            url: 'http://gitea.test/owner/app/issues/5',
            branch: 'feat/5-dark-mode',
            work: [],
          },
          {
            number: 3,
            title: 'Login breaks',
            labels: ['bug', 'ui'],
            updatedAt: 100,
            url: 'http://gitea.test/owner/app/issues/3',
            branch: 'fix/3-login-breaks',
            work: [],
          },
        ],
      });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('shows the worktrees on an issue branch and the live agents in them', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.issues.set('owner/app', [fakeIssue({ number: 8 })]);
      state.worktrees.set('app', [
        { path: '/work/app', branch: 'master' },
        { path: '/worktrees/feat-8-list', branch: 'feat/8-list' },
        { path: '/worktrees/fix-8-old', branch: 'fix/8-old' },
      ]);
      state.agents = [
        fakeAgent({ paneId: 'w9:p1', name: 'feat-8-list', cwd: '/worktrees/feat-8-list' }),
        fakeAgent({ paneId: 'w1:p1', name: 'other', cwd: '/work/app' }),
      ];

      const list = yield* issues();

      expect(list._tag === 'Listed' && list.issues[0]?.work).toEqual([
        { branch: 'feat/8-list', agents: [{ ref: 'feat-8-list', status: 'idle' }] },
        { branch: 'fix/8-old', agents: [] },
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('still lists the issues while Herdr is away', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.issues.set('owner/app', [fakeIssue({ number: 8 })]);
      state.worktrees.set('app', [{ path: '/worktrees/feat-8-list', branch: 'feat/8-list' }]);
      state.available = false;

      const list = yield* issues();

      expect(list._tag === 'Listed' && list.issues[0]?.work).toEqual([
        { branch: 'feat/8-list', agents: [] },
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reports a project whose origin is not on Gitea, without asking Gitea', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.origins.set('app', 'git@github.com:owner/app.git');

      expect(yield* issues()).toEqual({ _tag: 'NoGiteaRemote' });
      state.origins.delete('app');
      expect(yield* issues()).toEqual({ _tag: 'NoGiteaRemote' });
      expect(state.giteaCalls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reports a missing token as not configured, without asking Gitea', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.giteaConfigured = false;

      expect(yield* issues()).toEqual({ _tag: 'NotConfigured' });
      expect(state.giteaCalls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('fails for a project the app does not offer, without git', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      const error = yield* Effect.flip(issues('../etc'));

      expect(error).toEqual(new ProjectNotFoundError({ project: '../etc' }));
      expect(state.gitCalls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('passes on why Gitea fails', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.giteaFailure = 'Gitea refused the token (401).';

      const error = yield* Effect.flip(issues());

      expect(error).toEqual(
        new GiteaUnavailableError({ reason: 'Gitea refused the token (401).' }),
      );
    }).pipe(Effect.provide(layer())),
  );
});

describe('IssuesInbound.implement', () => {
  it.effect('creates the spec 005 task with Claude and the issue as its prompt', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const issue = fakeIssue({ number: 8, title: 'feat: issue list', body: 'Show them.' });
      state.issues.set('owner/app', [issue]);

      const created = yield* implement();

      expect(created).toEqual({
        workspace: 'w-feat/8-issue-list',
        branch: 'feat/8-issue-list',
        path: '/worktrees/feat-8-issue-list',
        agent: { ref: 'feat-8-issue-list', started: true, prompted: true, note: undefined },
      });
      expect(state.giteaCalls).toEqual(['issue owner/app 8']);
      expect(state.calls).toEqual([
        expect.objectContaining({
          method: 'createWorktree',
          params: expect.objectContaining({
            branch: 'feat/8-issue-list',
            label: 'feat: issue list',
          }),
        }),
        expect.objectContaining({ method: 'snapshot' }),
        expect.objectContaining({
          method: 'startAgent',
          params: expect.objectContaining({ kind: 'claude', name: 'feat-8-issue-list' }),
        }),
        { method: 'prompt', target: 'w-feat/8-issue-list:p1', params: issueTask(issue) },
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('creates nothing for a closed issue', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.issues.set('owner/app', [fakeIssue({ number: 8, state: 'closed' })]);

      const error = yield* Effect.flip(implement());

      expect(error).toEqual(new IssueClosedError({ number: 8 }));
      expect(state.gitCalls).toEqual(['originUrl app']);
      expect(state.calls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('treats a pull request and an unknown number as no issue', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.issues.set('owner/app', [fakeIssue({ number: 8, pull: true })]);

      expect(yield* Effect.flip(implement())).toEqual(new IssueNotFoundError({ number: 8 }));
      expect(yield* Effect.flip(implement({ number: 9 }))).toEqual(
        new IssueNotFoundError({ number: 9 }),
      );
      expect(state.calls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('creates nothing without a token or a Gitea remote', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.issues.set('owner/app', [fakeIssue({ number: 8 })]);
      state.giteaConfigured = false;

      expect(yield* Effect.flip(implement())).toEqual(new GiteaNotConfiguredError());
      state.origins.set('app', '/elsewhere/app');
      expect(yield* Effect.flip(implement())).toEqual(new NoGiteaRemoteError({ project: 'app' }));
      expect(state.calls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('keeps the spec 005 rules, such as the branch shape', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.issues.set('owner/app', [fakeIssue({ number: 8 })]);

      const error = yield* Effect.flip(implement({ branch: 'Feature/8' }));

      expect(error._tag).toBe('InvalidInputError');
      expect(state.calls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );
});
