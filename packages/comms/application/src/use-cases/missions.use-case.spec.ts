import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import { TestClock } from 'effect/testing';
import { MissionNotFoundError, MissionRefusedError } from '../errors.js';
import { fakeAgent, fakeIssue, fakeLayer, FakeState } from '../testing/fakes.js';
import { makeMissions } from './missions.use-case.js';

const layer = () => fakeLayer();

const SETTINGS = ['--settings', '/release/mission/claude-settings.json'];

/** A planet `app` at missions that passes preflight, with the open issues #7 and #8. */
const ready = (state: FakeState['Service']) => {
  state.registry = { planets: [{ name: 'app', autonomy: 'missions' }] };
  state.giteaRepositories.set('owner/app', {
    defaultBranch: 'master',
    files: new Map([
      ['AGENTS.md', '# app'],
      ['.github/workflows/ci.yml', 'on: push'],
      ['package.json', '{"scripts":{"verify":"pocket-ci verify"}}'],
    ]),
    runs: [{ status: 'completed', conclusion: 'success' }],
  });
  state.issues.set('owner/app', [
    fakeIssue({ number: 7, title: 'Fix the header', body: 'It overlaps.' }),
    fakeIssue({ number: 8, title: 'Add albums' }),
  ]);
};

const missions = makeMissions;

/** Why a send was refused. */
const refusal = (error: { readonly _tag: string }) =>
  error instanceof MissionRefusedError ? error.reason : error._tag;

/** The running mission's agent as the multiplexer reports it. */
const agentOf = (state: FakeState['Service'], name: string, status = 'working' as const) => {
  state.agents = [
    fakeAgent({ paneId: 'w-/worktrees/x:p1', name, status, session: 's1', kind: 'claude' }),
  ];
};

describe('sending a mission', () => {
  it.effect('is refused without the bot token, at manual, on no-go and twice', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);
      const { send } = yield* missions;

      state.bot.configured = false;
      expect(yield* send('app', 7, 'hop').pipe(Effect.flip)).toEqual(
        new MissionRefusedError({
          reason: 'Missions have no bot token (COMMS_MISSION_GITEA_TOKEN).',
        }),
      );
      state.bot.configured = true;

      state.registry = { planets: [{ name: 'app', autonomy: 'manual' }] };
      expect(refusal(yield* send('app', 7, 'hop').pipe(Effect.flip))).toBe(
        'app is at manual; choose missions on its planet page first.',
      );
      state.registry = { planets: [{ name: 'app', autonomy: 'missions' }] };

      state.bot.noPush.add('owner/app');
      expect(refusal(yield* send('app', 7, 'hop').pipe(Effect.flip))).toBe(
        'app is no-go: The mission bot may not push to the repository.',
      );
      state.bot.noPush.clear();

      state.bot.noIssueWrite.add('owner/app');
      expect(refusal(yield* send('app', 7, 'hop').pipe(Effect.flip))).toBe(
        "app is no-go: The mission bot's token lacks issue write access (write:issue).",
      );
      state.bot.noIssueWrite.clear();

      yield* send('app', 7, 'hop');
      expect(refusal(yield* send('app', 7, 'full-flight').pipe(Effect.flip))).toBe(
        '#7 is on a mission already (queued).',
      );
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('sets the lane label and queues the mission', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);
      state.started = { status: 'unknown', ready: false };
      state.agents = [fakeAgent({ paneId: 'p0', name: 'busy', status: 'working' })];
      const { send } = yield* missions;

      const sent = yield* send('app', 7, 'full-flight');

      expect(sent).toMatchObject({ planet: 'app', lane: 'full-flight', issue: { number: 7 } });
      expect(state.bot.calls[0]).toBe('setLane owner/app 7 full-flight');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});

describe('Autopilot and the usage limit (spec 038)', () => {
  it.effect('keeps that Autopilot sent a mission, and shows it', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);
      const { send, list } = yield* missions;

      const sent = yield* send('app', 7, 'hop', { autopilot: true });
      const owner = yield* send('app', 8, 'hop');

      expect(sent.autopilot).toBe(true);
      expect(owner.autopilot).toBeUndefined();
      expect(state.missions.missions.find((each) => each.issue.number === 7)?.autopilot).toBe(true);
      expect((yield* list).queue.map((each) => each.autopilot)).toEqual([true, undefined]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect("waits while Claude's usage limit holds a mission, and works on after it", () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);
      const { send, advance, list } = yield* missions;
      yield* send('app', 7, 'hop');
      yield* advance;
      const running = (yield* list).running;
      if (running?.agent === undefined) return yield* Effect.die('#7 did not start.');
      agentOf(state, running.agent);
      yield* advance;

      const resets = new Date(2026, 10, 28, 4, 5).getTime();
      state.usageLimits.set('s1', resets);
      yield* advance;
      const limited = (yield* list).running;
      expect(limited).toMatchObject({ state: 'waiting' });
      expect(limited?.reason).toBe("Claude's usage limit is reached; it resets at 04:05.");
      expect(state.missions.missions[0]?.limitedUntil).toBe(resets);

      state.usageLimits.clear();
      yield* advance;
      expect((yield* list).running).toMatchObject({ state: 'working', reason: undefined });
      expect(state.missions.missions[0]?.limitedUntil).toBeUndefined();
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('counts a limit only until it resets', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);
      const { send, advance, list } = yield* missions;
      yield* send('app', 7, 'hop');
      yield* advance;
      const running = (yield* list).running;
      if (running?.agent === undefined) return yield* Effect.die('#7 did not start.');
      agentOf(state, running.agent);
      state.usageLimits.set('s1', -1);
      yield* advance;

      expect((yield* list).running).toMatchObject({ state: 'working' });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});

describe('the mission queue', () => {
  it.effect('starts the oldest mission as the bot with the mission settings, one at a time', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);
      const { send, advance, list } = yield* missions;

      yield* send('app', 7, 'hop');
      yield* send('app', 8, 'hop');
      yield* advance;

      const { running, queue } = yield* list;
      expect(running).toMatchObject({ issue: { number: 7 }, state: 'working' });
      expect(queue.map((mission) => mission.issue.number)).toEqual([8]);
      const start = state.calls.find((call) => call.method === 'startAgent');
      expect(start?.params).toMatchObject({ kind: 'claude', args: SETTINGS });
      const prompt = state.calls.find((call) => call.method === 'prompt');
      expect(String(prompt?.params)).toContain('This is a hop');
      expect(
        state.bot.calls.some((call) => call.startsWith('prepareWorktree owner/app /worktrees/')),
      ).toBe(true);
      expect(state.bot.calls).toContain('markInProgress owner/app 7');
      expect(
        state.bot.calls.some((call) =>
          call.startsWith('comment owner/app 7 Mission started (hop)'),
        ),
      ).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('holds the next mission when its planet went no-go, and starts the one after', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);
      state.issues.set('owner/app', [
        ...(state.issues.get('owner/app') ?? []),
        fakeIssue({ number: 9, title: 'Third' }),
      ]);
      const { send, advance, list } = yield* missions;

      yield* send('app', 7, 'hop');
      state.bot.noPush.add('owner/app');
      yield* TestClock.adjust('1 second');
      yield* advance;

      const { running, log } = yield* list;
      expect(running).toBeUndefined();
      expect(log[0]).toMatchObject({
        issue: { number: 7 },
        state: 'held',
        reason: 'app is no-go: The mission bot may not push to the repository.',
        isNew: true,
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});

describe('a mission that does not start', () => {
  it.effect('fails with the reason, keeps its worktree, and a new send continues in it', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);
      const { send, advance, list } = yield* missions;
      yield* send('app', 7, 'hop');
      state.bot.failure = 'Gitea does not know the mission bot.';
      yield* advance;

      expect((yield* list).log[0]).toMatchObject({
        state: 'failed',
        reason: 'It did not start: Gitea does not know the mission bot.',
      });

      state.bot.failure = undefined;
      state.gitCalls.length = 0;
      yield* send('app', 7, 'hop');
      yield* advance;
      expect(state.gitCalls.some((call) => call.startsWith('addWorktree'))).toBe(false);
      expect((yield* list).running?.state).toBe('working');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});

describe("Claude's folder trust", () => {
  it.effect('is answered yes in the worktree the server made, and the first prompt follows', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);
      state.started = { status: 'blocked', ready: false, paneId: 'p-new' };
      const { send, advance } = yield* missions;
      state.screens.set(
        'p-new',
        'Do you trust the files in this folder?\n❯ 1. Yes, I trust this folder',
      );
      state.agents = [fakeAgent({ paneId: 'p-new', name: 'x', status: 'blocked', kind: 'claude' })];
      yield* send('app', 7, 'hop');

      const running = yield* Effect.forkChild(advance);
      yield* TestClock.adjust('1 second');
      // Claude takes input once the dialog is answered.
      state.agents = [fakeAgent({ paneId: 'p-new', name: 'x', status: 'idle', kind: 'claude' })];
      for (let step = 0; step < 30; step += 1) yield* TestClock.adjust('1 second');
      yield* Fiber.await(running);

      expect(state.calls.find((call) => call.method === 'sendKeys')?.params).toEqual([
        'down',
        'enter',
      ]);
      expect(state.calls.some((call) => call.method === 'prompt')).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});

describe('a running mission', () => {
  const started = Effect.gen(function* () {
    const state = yield* FakeState;
    ready(state);
    const service = yield* missions;
    yield* service.send('app', 7, 'hop');
    yield* service.send('app', 8, 'hop');
    yield* service.advance;
    const running = (yield* service.list).running;
    if (running?.agent === undefined) return yield* Effect.die('The mission did not start.');
    agentOf(state, running.agent);
    return { state, service, agent: running.agent, id: running.id };
  });

  it.effect('waits on the owner while its agent waits', () =>
    Effect.gen(function* () {
      const { state, service, agent } = yield* started;
      agentOf(state, agent, 'blocked' as 'working');
      yield* service.advance;
      expect((yield* service.list).running?.state).toBe('waiting');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('follows its pull request to merged, cleans up and starts the next one', () =>
    Effect.gen(function* () {
      const { state, service } = yield* started;
      const ref = { owner: 'owner', name: 'app', number: 12 };
      state.attachedLists = {
        s1: [{ ...ref, url: 'http://gitea.test/owner/app/pulls/12', attachedAt: 1 }],
      };
      state.pullRequests.set('owner/app#12', {
        title: 'fix: the header',
        state: 'open',
        url: 'http://gitea.test/owner/app/pulls/12',
        diff: '',
        files: [],
      });
      yield* service.advance;
      expect((yield* service.list).running?.state).toBe('pull-request');

      state.pullRequests.set('owner/app#12', {
        title: 'fix: the header',
        state: 'merged',
        url: 'http://gitea.test/owner/app/pulls/12',
        diff: '',
        files: [],
      });
      yield* service.advance;

      const { running, log } = yield* service.list;
      expect(log[0]).toMatchObject({
        issue: { number: 7 },
        state: 'not-deployed',
        reason: 'AGENTS.md has no `json mission-control` block.',
        pullRequest: { number: 12, url: 'http://gitea.test/owner/app/pulls/12' },
      });
      expect(state.calls.some((call) => call.method === 'closeWorkspace')).toBe(true);
      expect(state.gitCalls.some((call) => call.startsWith('removeWorktree app'))).toBe(true);
      expect(state.bot.calls).toContain('unmarkInProgress owner/app 7');
      expect(running?.issue.number).toBe(8);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect(
    'keeps a done outcome reported before the merge in the log once the merge is seen',
    () =>
      Effect.gen(function* () {
        const { state, service, agent } = yield* started;
        const pullRequest = (prState: 'open' | 'merged') => ({
          title: 'fix: the header',
          state: prState,
          url: 'http://pr/12',
          diff: '',
          files: [],
        });
        state.attachedLists = {
          s1: [{ owner: 'owner', name: 'app', number: 12, url: 'http://pr/12', attachedAt: 1 }],
        };
        state.pullRequests.set('owner/app#12', pullRequest('open'));
        yield* service.advance;

        // The skill reports done right before its merge call.
        yield* service.outcome(agent, { result: 'done', outcome: 'Fixed the header.' });

        // A merge that has not happened yet leaves the mission in its pull request.
        yield* service.advance;
        expect((yield* service.list).running).toMatchObject({
          state: 'pull-request',
          outcome: 'Fixed the header.',
        });

        state.pullRequests.set('owner/app#12', pullRequest('merged'));
        yield* service.advance;
        // The planet names no releases, so the merge ends it as not deployed (spec 036).
        expect((yield* service.list).log[0]).toMatchObject({
          state: 'not-deployed',
          outcome: 'Fixed the header.',
        });
      }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('lets a failed outcome replace a done one when the merge does not happen', () =>
    Effect.gen(function* () {
      const { service, agent } = yield* started;
      yield* service.outcome(agent, { result: 'done', outcome: 'Fixed the header.' });
      yield* service.outcome(agent, { result: 'failed', outcome: 'The merge was refused.' });
      expect((yield* service.list).log[0]).toMatchObject({
        state: 'failed',
        reason: 'The merge was refused.',
        outcome: 'The merge was refused.',
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('keeps a worktree with changes after the merge', () =>
    Effect.gen(function* () {
      const { state, service } = yield* started;
      state.changed.add('/worktrees/fix-7-fix-the-header');
      state.attachedLists = {
        s1: [{ owner: 'owner', name: 'app', number: 12, url: 'http://pr/12', attachedAt: 1 }],
      };
      state.pullRequests.set('owner/app#12', {
        title: 'x',
        state: 'merged',
        url: 'http://pr/12',
        diff: '',
        files: [],
      });
      yield* service.advance;
      expect(state.gitCalls.some((call) => call.startsWith('removeWorktree'))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('fails when its pull request is closed without merging', () =>
    Effect.gen(function* () {
      const { state, service } = yield* started;
      state.attachedLists = {
        s1: [{ owner: 'owner', name: 'app', number: 12, url: 'http://pr/12', attachedAt: 1 }],
      };
      state.pullRequests.set('owner/app#12', {
        title: 'x',
        state: 'closed',
        url: 'http://pr/12',
        diff: '',
        files: [],
      });
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({
        state: 'failed',
        reason: 'Pull request #12 was closed without merging.',
      });
      expect(state.bot.calls).toContain('unmarkInProgress owner/app 7');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('aborts, keeping the worktree, and a new send continues in it', () =>
    Effect.gen(function* () {
      const { state, service, id } = yield* started;
      yield* service.abort(id);

      const { log, running } = yield* service.list;
      expect(log[0]).toMatchObject({ state: 'aborted', reason: 'The owner aborted it.' });
      expect(state.bot.calls).toContain('unmarkInProgress owner/app 7');
      expect(
        state.bot.calls.some((call) => call.startsWith('comment owner/app 7 Mission aborted')),
      ).toBe(true);
      expect(state.gitCalls.some((call) => call.startsWith('removeWorktree'))).toBe(false);

      // #8 runs now; abort it too, then send #7 again.
      yield* service.advance;
      const next = (yield* service.list).running ?? running;
      if (next !== undefined) yield* service.abort(next.id);
      yield* service.advance;
      state.calls.length = 0;
      state.gitCalls.length = 0;
      yield* service.send('app', 7, 'hop');
      yield* service.advance;

      expect(state.gitCalls.some((call) => call.startsWith('addWorktree'))).toBe(false);
      const prompt = state.calls.find((call) => call.method === 'prompt');
      expect(String(prompt?.params)).toContain('Continue from your branch');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('fails on a failed outcome, and keeps a done outcome for the log', () =>
    Effect.gen(function* () {
      const { state, service, agent } = yield* started;
      yield* service.outcome(agent, { result: 'done', outcome: 'Fixed the header.' });
      expect((yield* service.list).running?.outcome).toBe('Fixed the header.');
      expect(state.bot.calls).not.toContain('unmarkInProgress owner/app 7');

      // The skill names the agent by its pane.
      yield* service.outcome('w-/worktrees/x:p1', { result: 'failed', outcome: 'CI stays red.' });
      expect((yield* service.list).log[0]).toMatchObject({
        state: 'failed',
        reason: 'CI stays red.',
      });
      expect(state.bot.calls).toContain('unmarkInProgress owner/app 7');
      expect(
        yield* service.outcome('stranger', { result: 'done', outcome: 'x' }).pipe(Effect.flip),
      ).toEqual(new MissionNotFoundError({ id: 'stranger' }));
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect(
    'is lost when its agent is gone, pauses the queue, and resumes with its conversation',
    () =>
      Effect.gen(function* () {
        const { state, service, id } = yield* started;
        yield* service.advance;
        state.agents = [];
        yield* service.advance;
        yield* service.advance;

        const lost = yield* service.list;
        expect(lost.running).toMatchObject({ id, state: 'lost' });
        expect(lost.queue.map((mission) => mission.issue.number)).toEqual([8]);

        yield* service.resume(id);
        const resumed = state.calls.filter((call) => call.method === 'startAgent').at(-1);
        expect(resumed?.params).toMatchObject({ args: [...SETTINGS, '--resume', 's1'] });
        expect((yield* service.list).running?.state).toBe('working');
      }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});

describe('the mission log', () => {
  it.effect('marks what finished since the owner last looked, until seen', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);
      const service = yield* missions;
      yield* service.send('app', 7, 'hop');
      state.bot.noPush.add('owner/app');
      yield* TestClock.adjust('1 second');
      yield* service.advance;
      expect((yield* service.list).newCount).toBe(1);

      yield* service.seen();
      const after = yield* service.list;
      expect(after.newCount).toBe(0);
      expect(after.log[0]?.isNew).toBeUndefined();
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('removes a queued mission without a trace', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);
      state.agents = [];
      const service = yield* missions;
      yield* service.send('app', 7, 'hop');
      yield* service.send('app', 8, 'hop');
      yield* service.advance;
      const queued = (yield* service.list).queue[0];
      if (queued === undefined) return yield* Effect.die('Nothing queued.');

      yield* service.remove(queued.id);
      const { queue, log } = yield* service.list;
      expect(queue).toEqual([]);
      expect(log).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});

describe('releasing and deploying a merged mission (spec 036)', () => {
  const block = (releases: string, migrations = '[]') =>
    `# app\n\n\`\`\`json mission-control\n{"releases":${releases},"migrations":${migrations}}\n\`\`\`\n`;
  const RELEASES =
    '[{"tag":"app-v","paths":["apps/"],"workflow":"release.yml","app":"pocket-app"}]';

  /** A planet that deploys, with the tag app-v0.3.0 and the given commits after it. */
  const deploys = (
    state: FakeState['Service'],
    commits: ReadonlyArray<{ subject: string; files: ReadonlyArray<string>; body?: string }>,
    agentsMd = block(RELEASES),
  ) => {
    ready(state);
    const repository = state.giteaRepositories.get('owner/app');
    if (repository === undefined) throw new Error('no repository');
    state.giteaRepositories.set('owner/app', {
      ...repository,
      files: new Map([...repository.files, ['AGENTS.md', agentsMd]]),
    });
    state.registry = {
      appsSeeded: true,
      planets: [{ name: 'app', autonomy: 'missions', apps: ['pocket-app'] }],
    };
    state.bases.set('app', 'origin/master');
    state.pushSubscriptions = [
      { endpoint: 'https://push.test/1', keys: { p256dh: 'k', auth: 'a' } },
    ] as typeof state.pushSubscriptions;
    state.releaseGit.set('app', {
      tags: ['app-v0.3.0'],
      refs: new Map([
        ['app-v0.3.0', 'c0'],
        ['origin/master', `c${commits.length}`],
      ]),
      commits: [
        { sha: 'c0', subject: 'feat: before', body: '', files: ['apps/a.ts'] },
        ...commits.map((commit, index) => ({
          sha: `c${index + 1}`,
          subject: commit.subject,
          body: commit.body ?? '',
          files: [...commit.files],
        })),
      ],
    });
  };

  /** Sends #7 (and #8 unless `alone`), starts #7, and merges its pull request. */
  const mergedWith = (alone: boolean) =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const service = yield* missions;
      yield* service.send('app', 7, 'hop');
      if (!alone) yield* service.send('app', 8, 'hop');
      yield* service.advance;
      const running = (yield* service.list).running;
      if (running?.agent === undefined) return yield* Effect.die('The mission did not start.');
      agentOf(state, running.agent);
      state.attachedLists = {
        s1: [{ owner: 'owner', name: 'app', number: 12, url: 'http://pr/12', attachedAt: 1 }],
      };
      state.pullRequests.set('owner/app#12', {
        title: 'fix: the header',
        state: 'merged',
        url: 'http://pr/12',
        diff: '',
        files: [],
      });
      yield* service.advance;
      return { state, service, id: running.id };
    });
  const merged = mergedWith(false);

  it.effect('tags, waits for the release run, deploys, and only then starts the next', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [{ subject: 'fix(web): the header', files: ['apps/web/header.ts'] }]);
      const { service, id } = yield* merged;
      expect((yield* service.list).running).toMatchObject({ id, state: 'releasing' });
      const refused = yield* service.abort(id).pipe(Effect.flip);
      expect(refused).toBeInstanceOf(MissionNotFoundError);

      yield* service.advance;
      expect(state.bot.calls).toContain('pushTag owner/app app-v0.3.1 c1');
      expect((yield* service.list).running?.state).toBe('releasing');

      state.tagRuns.set('owner/app release.yml app-v0.3.1', { status: 'running' });
      yield* service.advance;
      expect((yield* service.list).running?.state).toBe('releasing');

      state.tagRuns.set('owner/app release.yml app-v0.3.1', {
        status: 'completed',
        conclusion: 'success',
      });
      yield* service.advance;
      expect((yield* service.list).running?.state).toBe('deploying');
      yield* service.advance;
      expect(state.deploy.started).toEqual([
        { id: `${id}-0`, app: 'pocket-app', version: '0.3.1', backup: false },
      ]);
      yield* service.advance;
      expect((yield* service.list).running?.id).toBe(id);

      state.deploy.results.set(`${id}-0`, { result: 'deployed', output: 'healthy' });
      yield* service.advance;
      const { running, log } = yield* service.list;
      expect(log[0]).toMatchObject({ id, state: 'deployed', versions: ['app-v0.3.1'] });
      expect(state.bot.calls).toContain('comment owner/app 7 Deployed app-v0.3.1.');
      expect(running?.issue.number).toBe(8);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('ends not deployed, with why, when a deploy check fails', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [{ subject: 'fix: a', files: ['apps/a.ts'] }]);
      state.deploy.checks.set('pocket-app', {
        ready: false,
        reason: 'No health URL for pocket-app.',
      });
      const { service, id } = yield* merged;
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'not-deployed',
        reason: 'No health URL for pocket-app.',
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('has nothing to release without a feat, fix or perf, and pushes no tag', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [
        { subject: 'docs: words', files: ['apps/README.md'] },
        { subject: 'feat: elsewhere', files: ['tools/x.ts'] },
      ]);
      const { service, id } = yield* merged;
      expect((yield* service.list).log[0]).toMatchObject({ id, state: 'nothing-to-release' });
      expect(state.bot.calls.some((call) => call.startsWith('pushTag'))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect(
    'waits for the owner on a migration, lets the queue go on, and holds later merges',
    () =>
      Effect.gen(function* () {
        const state = yield* FakeState;
        deploys(
          state,
          [{ subject: 'fix: a column', files: ['apps/db/migrations/0002.sql'] }],
          block(RELEASES, '["apps/db/migrations/"]'),
        );
        const { service, id } = yield* merged;
        const first = yield* service.list;
        expect(first.log[0]).toMatchObject({ id, state: 'awaiting-deploy' });
        expect(first.log[0]?.reason).toContain('database migration');
        expect(first.running?.issue.number).toBe(8);

        // #8 merges while #7 waits: it waits with it.
        const second = first.running;
        if (second?.agent === undefined) return yield* Effect.die('#8 did not start.');
        agentOf(state, second.agent);
        state.attachedLists = {
          s1: [{ owner: 'owner', name: 'app', number: 13, url: 'http://pr/13', attachedAt: 2 }],
        };
        state.pullRequests.set('owner/app#13', {
          title: 'fix: b',
          state: 'merged',
          url: 'http://pr/13',
          diff: '',
          files: [],
        });
        yield* TestClock.adjust('1 second');
        yield* service.advance;
        const both = (yield* service.list).log;
        expect(both.map((mission) => mission.state)).toEqual([
          'awaiting-deploy',
          'awaiting-deploy',
        ]);

        // Deploy ships both, with the backup the migration needs.
        yield* service.deploy(second.id);
        yield* service.advance;
        const deploying = (yield* service.list).running;
        expect(deploying).toMatchObject({ id, state: 'releasing' });
        yield* service.advance;
        state.tagRuns.set('owner/app release.yml app-v0.3.1', {
          status: 'completed',
          conclusion: 'success',
        });
        yield* service.advance;
        yield* service.advance;
        expect(state.deploy.started[0]).toMatchObject({ backup: true, version: '0.3.1' });
        state.deploy.results.set(`${id}-0`, { result: 'deployed', output: '' });
        yield* service.advance;
        const log = (yield* service.list).log;
        expect(log.map((mission) => mission.state)).toEqual(['deployed', 'deployed']);
        expect(log.find((mission) => mission.id === second.id)?.reason).toContain(
          'shipped with #7',
        );
      }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect(
    'waits for the owner on a breaking change, whose Deploy raises the minor below 1.0',
    () =>
      Effect.gen(function* () {
        const state = yield* FakeState;
        deploys(state, [{ subject: 'feat!: a new api', files: ['apps/api.ts'] }]);
        const { service, id } = yield* mergedWith(true);
        expect((yield* service.list).log[0]).toMatchObject({ id, state: 'awaiting-deploy' });
        yield* service.deploy(id);
        yield* service.advance;
        yield* service.advance;
        expect(state.bot.calls).toContain('pushTag owner/app app-v0.4.0 c1');

        // No migration, so no backup: a planet without a database deploys too.
        state.tagRuns.set('owner/app release.yml app-v0.4.0', {
          status: 'completed',
          conclusion: 'success',
        });
        yield* service.advance;
        yield* service.advance;
        expect(state.deploy.started[0]).toMatchObject({ backup: false, version: '0.4.0' });
      }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('rolls back: output kept, fix issue opened, owner told, the planet paused', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [{ subject: 'fix: a', files: ['apps/a.ts'] }]);
      state.tagRuns.set('owner/app release.yml app-v0.3.1', {
        status: 'completed',
        conclusion: 'success',
      });
      const { service, id } = yield* merged;
      yield* service.advance;
      yield* service.advance;
      yield* service.advance;
      state.deploy.results.set(`${id}-0`, {
        result: 'rolled-back',
        output: 'health check failed: 503',
      });
      yield* service.advance;
      const { log, running } = yield* service.list;
      expect(log[0]).toMatchObject({
        id,
        state: 'rolled-back',
        output: 'health check failed: 503',
        reason: 'app-v0.3.1 failed its health check and was rolled back.',
      });
      expect(log[0]?.fixIssue).toBeDefined();
      expect(
        state.bot.calls.some(
          (call) => call === 'openIssue owner/app Fix the failed deploy of app-v0.3.1',
        ),
      ).toBe(true);
      expect(state.pushes[0]?.notification.title).toBe('Deploy rolled back: app');
      // The planet is no-go now, so #8 is held on the next step.
      expect(running).toBeUndefined();
      yield* service.advance;
      const after = yield* service.list;
      expect(after.running).toBeUndefined();
      expect(after.log.find((mission) => mission.issue.number === 8)?.state).toBe('held');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('fails a release whose run never appears, and a deploy without a result', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [{ subject: 'fix: a', files: ['apps/a.ts'] }]);
      const { service, id } = yield* merged;
      yield* service.advance;
      yield* TestClock.adjust('11 minutes');
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'failed',
        reason: 'The release workflow release.yml of app-v0.3.1 did not start within 10 minutes.',
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('does not count the time Gitea cannot answer toward a release run appearing', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [{ subject: 'fix: a', files: ['apps/a.ts'] }]);
      const { service, id } = yield* merged;
      yield* service.advance;
      state.tagRunFailure = 'Gitea is down.';
      yield* service.advance;
      yield* TestClock.adjust('11 minutes');
      yield* service.advance;
      expect((yield* service.list).running).toMatchObject({ id, state: 'releasing' });

      state.tagRunFailure = undefined;
      yield* service.advance;
      yield* TestClock.adjust('9 minutes');
      yield* service.advance;
      expect((yield* service.list).running).toMatchObject({ id, state: 'releasing' });

      yield* TestClock.adjust('2 minutes');
      yield* service.advance;
      expect((yield* service.list).log.find((mission) => mission.id === id)).toMatchObject({
        state: 'failed',
        reason: 'The release workflow release.yml of app-v0.3.1 did not start within 10 minutes.',
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('fails a release whose runs Gitea cannot read for 60 minutes in a row', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [{ subject: 'fix: a', files: ['apps/a.ts'] }]);
      const { service, id } = yield* merged;
      yield* service.advance;
      state.tagRunFailure = 'Gitea refused the token (403).';
      yield* service.advance;
      yield* TestClock.adjust('30 minutes');
      yield* service.advance;
      expect((yield* service.list).running).toMatchObject({ id, state: 'releasing' });

      yield* TestClock.adjust('31 minutes');
      yield* service.advance;
      expect((yield* service.list).log.find((mission) => mission.id === id)).toMatchObject({
        state: 'failed',
        reason:
          'Gitea could not say for 60 minutes how the release runs go: Gitea refused the token (403).',
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  /** Merges #7 and runs it to a started deploy of app-v0.3.1. */
  const deploying = Effect.gen(function* () {
    const state = yield* FakeState;
    deploys(state, [{ subject: 'fix: a', files: ['apps/a.ts'] }]);
    state.tagRuns.set('owner/app release.yml app-v0.3.1', {
      status: 'completed',
      conclusion: 'success',
    });
    const { service, id } = yield* merged;
    yield* service.advance;
    yield* service.advance;
    yield* service.advance;
    expect(state.deploy.started).toHaveLength(1);
    return { state, service, id };
  });

  it.effect('waits for a deploy whose process still runs, also across a restart (spec 037)', () =>
    Effect.gen(function* () {
      const { state, id } = yield* deploying;
      // A new server (comms deployed itself) finds the mission deploying and reads on.
      const restarted = yield* missions;
      yield* TestClock.adjust('40 minutes');
      yield* restarted.advance;
      expect((yield* restarted.list).running).toMatchObject({ id, state: 'deploying' });
      state.deploy.results.set(`${id}-0`, { result: 'deployed', output: 'healthy' });
      yield* restarted.advance;
      expect((yield* restarted.list).log[0]).toMatchObject({ id, state: 'deployed' });
      expect(state.deploy.started).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('is deploy lost when its process ended without a result, and pauses', () =>
    Effect.gen(function* () {
      const { state, service, id } = yield* deploying;
      state.deploy.ended.add(5001);
      yield* service.advance;
      const { log } = yield* service.list;
      expect(log[0]).toMatchObject({
        id,
        state: 'deploy-lost',
        reason: 'The deploy of app-v0.3.1 ended without a result.',
        versions: ['app-v0.3.1'],
      });
      expect(log[0]?.fixIssue).toBeDefined();
      expect(state.pushes[0]?.notification.title).toBe('Deploy lost: app');
      yield* service.advance;
      expect((yield* service.list).log.find((mission) => mission.issue.number === 8)?.state).toBe(
        'held',
      );
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('is deploy lost when its process still runs after 2 hours', () =>
    Effect.gen(function* () {
      const { service, id } = yield* deploying;
      yield* TestClock.adjust('121 minutes');
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'deploy-lost',
        reason: 'The deploy of app-v0.3.1 still runs after 2 hours.',
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('reads a result written right before the process ended', () =>
    Effect.gen(function* () {
      const { state, service, id } = yield* deploying;
      state.deploy.ended.add(5001);
      state.deploy.results.set(`${id}-0`, { result: 'deployed', output: '' });
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({ id, state: 'deployed' });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('is down when the rollback failed too, and tells the owner so', () =>
    Effect.gen(function* () {
      const { state, service, id } = yield* deploying;
      state.deploy.results.set(`${id}-0`, { result: 'down', output: 'rollback unhealthy' });
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'down',
        output: 'rollback unhealthy',
        reason: 'app-v0.3.1 failed its health check, and the rollback was not healthy either.',
      });
      expect(state.pushes[0]?.notification.title).toBe('app is down: deploy and rollback failed');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('fails a deploy that failed before deploying, or could not start, at once', () =>
    Effect.gen(function* () {
      const { state, service, id } = yield* deploying;
      state.deploy.results.set(`${id}-0`, { result: 'failed', output: 'backup failed' });
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'failed',
        reason: 'The deploy of app-v0.3.1 failed before it deployed anything.',
        output: 'backup failed',
      });
      expect(state.pushes[0]?.notification.title).toBe('Release failed: app');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('fails at once when the deploy script cannot start, and pauses', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [{ subject: 'fix: a', files: ['apps/a.ts'] }]);
      state.tagRuns.set('owner/app release.yml app-v0.3.1', {
        status: 'completed',
        conclusion: 'success',
      });
      state.deploy.startFailure = 'The deploy script did not start: spawn EACCES';
      const { service, id } = yield* merged;
      yield* service.advance;
      yield* service.advance;
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'failed',
        reason: 'The deploy script did not start: spawn EACCES',
      });
      yield* service.advance;
      expect((yield* service.list).log.find((mission) => mission.issue.number === 8)?.state).toBe(
        'held',
      );
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('opens a fix issue Gitea refused on a later step, and Resume lifts the pause', () =>
    Effect.gen(function* () {
      const { state, service, id } = yield* deploying;
      state.deploy.results.set(`${id}-0`, { result: 'rolled-back', output: '503' });
      state.bot.failure = 'Gitea is down.';
      yield* service.advance;
      expect((yield* service.list).log[0]?.fixIssue).toBeUndefined();
      state.bot.failure = undefined;
      yield* service.advance;
      const fixIssue = (yield* service.list).log.find((mission) => mission.id === id)?.fixIssue;
      expect(fixIssue).toBeDefined();
      expect(
        state.bot.calls.filter((call) => call.startsWith('openIssue owner/app Fix the failed')),
      ).toHaveLength(1);

      yield* service.resumePlanet('app');
      expect(state.bot.calls).toContain(`closeIssue owner/app ${fixIssue} Resumed by the owner.`);
      expect(state.missions.missions.find((mission) => mission.id === id)?.resumedAt).toBeDefined();
      const again = yield* service.resumePlanet('app').pipe(Effect.flip);
      expect(refusal(again)).toBe('app is not paused.');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  /**
   * After #7's failed release, the pushed tags and a `ci:` fix land on master, the owner resumes
   * the planet, and #8 merges (issue 143).
   */
  const fixedAndMergedAgain = (pushed: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const service = yield* missions;
      const git = state.releaseGit.get('app');
      if (git === undefined) return yield* Effect.die('no release git');
      git.tags.push(...pushed);
      for (const tag of pushed) git.refs.set(tag, 'c1');
      git.commits.push({ sha: 'c2', subject: 'ci: fix the release', body: '', files: ['.ci'] });
      git.refs.set('origin/master', 'c2');
      yield* service.resumePlanet('app');
      state.bot.calls.length = 0;
      yield* service.send('app', 8, 'hop');
      yield* service.advance;
      const running = (yield* service.list).running;
      if (running?.agent === undefined) return yield* Effect.die('#8 did not start.');
      agentOf(state, running.agent);
      state.attachedLists = {
        s1: [{ owner: 'owner', name: 'app', number: 13, url: 'http://pr/13', attachedAt: 2 }],
      };
      state.pullRequests.set('owner/app#13', {
        title: 'ci: fix the release',
        state: 'merged',
        url: 'http://pr/13',
        diff: '',
        files: [],
      });
      yield* TestClock.adjust('1 second');
      yield* service.advance;
      yield* service.advance;
      return state.bot.calls.filter((call) => call.startsWith('pushTag'));
    });

  it.effect('releases a failed release again as the next patch after a ci fix (issue 143)', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [{ subject: 'fix: a', files: ['apps/a.ts'] }]);
      const { service, id } = yield* mergedWith(true);
      yield* service.advance;
      expect(state.bot.calls).toContain('pushTag owner/app app-v0.3.1 c1');
      state.tagRuns.set('owner/app release.yml app-v0.3.1', {
        status: 'completed',
        conclusion: 'failure',
      });
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({ id, state: 'failed' });

      expect(yield* fixedAndMergedAgain(['app-v0.3.1'])).toEqual([
        'pushTag owner/app app-v0.3.2 c2',
      ]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('releases both again after a partial tag push, past the pushed tag (issue 143)', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(
        state,
        [{ subject: 'fix: a', files: ['apps/a.ts', 'web/b.ts'] }],
        block(`${RELEASES.slice(0, -1)},{"tag":"web-v","paths":["web/"]}]`),
      );
      const git = state.releaseGit.get('app');
      git?.tags.push('web-v0.1.0');
      git?.refs.set('web-v0.1.0', 'c0');
      state.bot.refusedTags.add('web-v0.1.1');
      const { service, id } = yield* mergedWith(true);
      yield* service.advance;
      expect(state.bot.calls).toContain('pushTag owner/app app-v0.3.1 c1');
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'failed',
        reason: 'The tag web-v0.1.1 could not be pushed: web-v0.1.1 is refused.',
      });

      state.bot.refusedTags.clear();
      expect(yield* fixedAndMergedAgain(['app-v0.3.1'])).toEqual([
        'pushTag owner/app app-v0.3.2 c2',
        'pushTag owner/app web-v0.1.1 c2',
      ]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect("waits for master's CI on the merge before any tag (spec 037)", () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [{ subject: 'fix: a', files: ['apps/a.ts'] }]);
      state.commitStatuses.set('owner/app c1', 'pending');
      const { service, id } = yield* merged;
      yield* service.advance;
      expect(state.bot.calls.some((call) => call.startsWith('pushTag'))).toBe(false);
      expect((yield* service.list).running).toMatchObject({ id, state: 'releasing' });
      state.commitStatuses.set('owner/app c1', 'success');
      yield* service.advance;
      expect(state.bot.calls).toContain('pushTag owner/app app-v0.3.1 c1');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('ends not deployed on a red or late master CI, without a pause', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [{ subject: 'fix: a', files: ['apps/a.ts'] }]);
      state.commitStatuses.set('owner/app c1', 'failure');
      const { service, id } = yield* merged;
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'not-deployed',
        reason: 'master CI failed on c1.',
      });
      expect(state.bot.calls.some((call) => call.startsWith('openIssue'))).toBe(false);
      expect(state.bot.calls.some((call) => call.startsWith('pushTag'))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('gives up on a master CI that does not finish within 60 minutes', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [{ subject: 'fix: a', files: ['apps/a.ts'] }]);
      state.commitStatuses.set('owner/app c1', 'pending');
      const { service, id } = yield* merged;
      yield* TestClock.adjust('61 minutes');
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'not-deployed',
        reason: 'master CI did not finish within 60 minutes.',
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('does not release an app the planet does not allow', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(state, [{ subject: 'fix: a', files: ['apps/a.ts'] }]);
      state.registry = { appsSeeded: true, planets: [{ name: 'app', autonomy: 'missions' }] };
      const { service, id } = yield* mergedWith(true);
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'not-deployed',
        reason: 'pocket-app is not allowed for app.',
      });
      expect(state.bot.calls.some((call) => call.startsWith('pushTag'))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  /** #7 merged with a breaking change, waiting for the owner's Deploy. */
  const waitingForDeploy = Effect.gen(function* () {
    const state = yield* FakeState;
    deploys(state, [{ subject: 'feat!: a new api', files: ['apps/api.ts'] }]);
    const { service, id } = yield* mergedWith(true);
    expect((yield* service.list).log[0]).toMatchObject({ id, state: 'awaiting-deploy' });
    return { state, service, id };
  });

  it.effect('refuses a Deploy while the planet is no-go, and keeps it waiting', () =>
    Effect.gen(function* () {
      const { state, service, id } = yield* waitingForDeploy;
      const repository = state.giteaRepositories.get('owner/app');
      if (repository === undefined) return yield* Effect.die('no repository');
      state.giteaRepositories.set('owner/app', {
        ...repository,
        runs: [{ status: 'completed', conclusion: 'failure' }],
      });
      const refused = yield* service.deploy(id).pipe(Effect.flip);
      expect(refusal(refused)).toContain('app is no-go: ');
      expect((yield* service.list).log[0]).toMatchObject({ id, state: 'awaiting-deploy' });

      state.deploy.configured = false;
      state.giteaRepositories.set('owner/app', repository);
      const noScript = yield* service.deploy(id).pipe(Effect.flip);
      expect(refusal(noScript)).toContain('app does not deploy: ');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('puts a Deploy that cannot start back to waiting, and one taken out', () =>
    Effect.gen(function* () {
      const { state, service, id } = yield* waitingForDeploy;
      // A send keeps the queue busy, so the Deploy stays queued while the planet turns no-go.
      yield* service.deploy(id);
      expect(state.missions.missions.find((mission) => mission.id === id)?.state).toBe('queued');
      yield* service.remove(id);
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'awaiting-deploy',
        reason: 'Your Deploy could not go on: you took it out of the mission queue.',
      });

      yield* service.deploy(id);
      state.registry = { appsSeeded: true, planets: [{ name: 'app', autonomy: 'manual' }] };
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'awaiting-deploy',
        reason: 'Your Deploy could not go on: app is at manual now.',
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('puts an owner Deploy whose master CI failed back to waiting', () =>
    Effect.gen(function* () {
      const { state, service, id } = yield* waitingForDeploy;
      yield* service.deploy(id);
      state.commitStatuses.set('owner/app c1', 'failure');
      yield* service.advance;
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'awaiting-deploy',
        reason: 'Your Deploy could not go on: master CI failed on c1.',
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('publishes a release without an app once its workflow succeeded', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      deploys(
        state,
        [{ subject: 'feat(design): a tile', files: ['packages/design/tile.tsx'] }],
        block('[{"tag":"design-v","paths":["packages/design/"],"workflow":"design-release.yml"}]'),
      );
      state.releaseGit.get('app')?.tags.splice(0, 1, 'design-v0.48.0');
      state.releaseGit.get('app')?.refs.set('design-v0.48.0', 'c0');
      state.tagRuns.set('owner/app design-release.yml design-v0.49.0', {
        status: 'completed',
        conclusion: 'success',
      });
      const { service, id } = yield* merged;
      yield* service.advance;
      yield* service.advance;
      expect((yield* service.list).log[0]).toMatchObject({
        id,
        state: 'deployed',
        versions: ['design-v0.49.0'],
      });
      expect(state.deploy.started).toHaveLength(0);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});
