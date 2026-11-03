import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as PubSub from 'effect/PubSub';
import * as Queue from 'effect/Queue';
import { TestClock } from 'effect/testing';
import type { OverviewStateDto } from '../dto/agent.dto.js';
import { HerdrUnavailableError } from '../errors.js';
import { AgentsInbound } from '../ports/agents.inbound.port.js';
import { fakeAgent, fakeLayer, FakeState } from '../testing/fakes.js';
import { collect, settle } from '../testing/streams.js';

const layer = () => AgentsInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

describe('AgentsInbound.overview', () => {
  it.effect('groups the agents and lists the blocked one under Needs you', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [
        fakeAgent({ paneId: 'w1:p1', name: 'kirk', status: 'working', title: 'Fix the build' }),
        fakeAgent({ paneId: 'w2:p1', workspaceId: 'w2', status: 'blocked', kind: 'pi' }),
      ];

      const overview = yield* AgentsInbound.use((inbound) => inbound.overview);

      expect(overview.needsYou.map((agent) => agent.ref)).toEqual(['w2:p1']);
      expect(overview.needsYou[0]).toMatchObject({ format: 'pi', needsYou: true });
      expect(overview.groups).toEqual([
        {
          key: '/work/app/.git',
          name: 'app',
          agents: [
            expect.objectContaining({
              ref: 'kirk',
              paneId: 'w1:p1',
              name: 'kirk',
              kind: 'claude',
              format: 'claude',
              status: 'working',
              title: 'Fix the build',
              cwd: '/work/app',
              workspace: 'app',
              needsYou: false,
            }),
          ],
        },
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('keeps a done agent with running background work out of Needs you', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      yield* TestClock.setTime(10_000);
      state.agents = [fakeAgent({ paneId: 'w1:p1', status: 'done', completion: 3, session: 's1' })];
      state.transcripts.set('s1', {
        entries: [],
        modifiedAt: 1_000,
        background: [
          {
            id: 't2',
            kind: 'subagent',
            description: 'Review',
            startedAt: 2_000,
            inBackground: true,
          },
          {
            id: 't1',
            kind: 'shell',
            description: 'Wait for CI',
            startedAt: 1_000,
            inBackground: true,
          },
        ],
      });

      const overview = yield* AgentsInbound.use((inbound) => inbound.overview);

      expect(overview.needsYou).toEqual([]);
      expect(overview.groups[0]?.agents[0]).toMatchObject({
        needsYou: false,
        background: [
          { id: 't1', kind: 'shell', description: 'Wait for CI' },
          { id: 't2', kind: 'subagent', description: 'Review' },
        ],
      });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('drops a monitor from the background work once it expired', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', status: 'done', completion: 3, session: 's1' })];
      state.transcripts.set('s1', {
        entries: [],
        modifiedAt: 1_000,
        background: [
          {
            id: 'm1',
            kind: 'monitor',
            description: 'Watch',
            startedAt: 1_000,
            inBackground: true,
            expiresAt: 60_000,
          },
        ],
      });

      yield* TestClock.setTime(59_999);
      const before = yield* AgentsInbound.use((inbound) => inbound.overview);
      yield* TestClock.setTime(60_000);
      const after = yield* AgentsInbound.use((inbound) => inbound.overview);

      expect(before.groups[0]?.agents[0]?.background).toHaveLength(1);
      expect(after.needsYou.map((agent) => [agent.ref, agent.background])).toEqual([['w1:p1', []]]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('shows no background work for an agent whose session cannot be read', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', status: 'done', completion: 3, session: 's9' })];

      const overview = yield* AgentsInbound.use((inbound) => inbound.overview);

      expect(overview.needsYou[0]?.background).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('names the project and worktree of each agent', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [
        fakeAgent({ paneId: 'w1:p1', name: 'kirk' }),
        fakeAgent({ paneId: 'w2:p1', name: 'spock', workspaceId: 'w2' }),
        fakeAgent({ paneId: 'w3:p1', name: 'scotty', workspaceId: 'w3' }),
      ];

      const overview = yield* AgentsInbound.use((inbound) => inbound.overview);

      expect(
        overview.groups.flatMap((group) =>
          group.agents.map((agent) => [group.key, agent.ref, agent.project, agent.worktree]),
        ),
      ).toEqual([
        ['/work/app/.git', 'kirk', 'app', undefined],
        ['/work/app/.git', 'spock', 'app', 'feature'],
        ['other', 'scotty', undefined, undefined],
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('dates an agent by its session file when that changed last', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      yield* TestClock.setTime(10_000);
      state.agents = [fakeAgent({ paneId: 'w1:p1', session: 's1' })];
      state.transcripts.set('s1', { entries: [], modifiedAt: 4_000 });

      const first = yield* AgentsInbound.use((inbound) => inbound.overview);
      expect(first.groups[0]?.agents[0]?.changedAt).toBe(4_000);

      state.transcripts.set('s1', { entries: [], modifiedAt: 12_000 });
      const later = yield* AgentsInbound.use((inbound) => inbound.overview);
      expect(later.groups[0]?.agents[0]?.changedAt).toBe(12_000);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('dates an agent by its last status change when it has no session file', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      yield* TestClock.setTime(10_000);
      state.agents = [fakeAgent({ paneId: 'w1:p1', status: 'idle' })];
      yield* AgentsInbound.use((inbound) => inbound.overview);

      yield* TestClock.setTime(20_000);
      const unchanged = yield* AgentsInbound.use((inbound) => inbound.overview);
      expect(unchanged.groups[0]?.agents[0]?.changedAt).toBe(10_000);

      state.agents = [fakeAgent({ paneId: 'w1:p1', status: 'working' })];
      yield* TestClock.setTime(30_000);
      const changed = yield* AgentsInbound.use((inbound) => inbound.overview);
      expect(changed.groups[0]?.agents[0]?.changedAt).toBe(30_000);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('fails when Herdr cannot be reached', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.available = false;

      const error = yield* AgentsInbound.use((inbound) => inbound.overview).pipe(Effect.flip);

      expect(error).toBeInstanceOf(HerdrUnavailableError);
    }).pipe(Effect.provide(layer())),
  );
});

describe('AgentsInbound.overviewChanges', () => {
  const needsYouCount = (state: OverviewStateDto) =>
    state._tag === 'Available' ? state.overview.needsYou.length : -1;

  it.effect('emits the overview at once and again when Herdr reports a change', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', status: 'working' })];
      const changes = yield* collect(
        yield* AgentsInbound.use((inbound) => Effect.succeed(inbound.overviewChanges)),
      );

      expect(needsYouCount(yield* Queue.take(changes))).toBe(0);
      yield* settle;
      state.agents = [fakeAgent({ paneId: 'w1:p1', status: 'blocked' })];
      yield* PubSub.publish(state.herdrChanges, undefined);

      expect(needsYouCount(yield* Queue.take(changes))).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('emits nothing new when a change leaves the overview as it was', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1' })];
      const changes = yield* collect(
        yield* AgentsInbound.use((inbound) => Effect.succeed(inbound.overviewChanges)),
      );
      yield* Queue.take(changes);
      yield* settle;

      yield* PubSub.publish(state.herdrChanges, undefined);
      yield* settle;
      state.agents = [fakeAgent({ paneId: 'w1:p1', title: 'Renamed' })];
      yield* PubSub.publish(state.herdrChanges, undefined);

      const next = yield* Queue.take(changes);
      expect(
        next._tag === 'Available' ? next.overview.groups[0]?.agents[0]?.title : undefined,
      ).toBe('Renamed');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('reports Herdr as unavailable instead of failing, and recovers', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.available = false;
      const changes = yield* collect(
        yield* AgentsInbound.use((inbound) => Effect.succeed(inbound.overviewChanges)),
      );

      expect((yield* Queue.take(changes))._tag).toBe('Unavailable');
      yield* settle;
      state.available = true;
      yield* PubSub.publish(state.herdrChanges, undefined);

      expect((yield* Queue.take(changes))._tag).toBe('Available');
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('emits again when the owner sees a done agent', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', status: 'done', completion: 2 })];
      const changes = yield* collect(
        yield* AgentsInbound.use((inbound) => Effect.succeed(inbound.overviewChanges)),
      );

      expect(needsYouCount(yield* Queue.take(changes))).toBe(1);
      yield* settle;
      yield* AgentsInbound.use((inbound) => inbound.markSeen('kirk'));

      expect(needsYouCount(yield* Queue.take(changes))).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});
