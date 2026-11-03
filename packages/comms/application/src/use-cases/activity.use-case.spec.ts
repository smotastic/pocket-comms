import { describe, expect, it } from '@effect/vitest';
import { ACTIVITY_WINDOW_MS, type ActivityEvent } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as PubSub from 'effect/PubSub';
import * as Queue from 'effect/Queue';
import { TestClock } from 'effect/testing';
import type { ActivityDto } from '../dto/activity.dto.js';
import { ActivityInbound } from '../ports/activity.inbound.port.js';
import { fakeAgent, fakeLayer, FakeState } from '../testing/fakes.js';
import { collect, settle } from '../testing/streams.js';

// The recorder takes its baseline when the layer starts, so each test arranges Herdr first and
// then provides the layer.
const withActivity = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(ActivityInbound.layer));

const tick = Effect.gen(function* () {
  const state = yield* FakeState;
  yield* settle;
  yield* PubSub.publish(state.herdrChanges, undefined);
  yield* settle;
});

const summary = (events: ReadonlyArray<ActivityEvent>) =>
  events.map((event) =>
    event.type === 'status'
      ? `${event.agent.ref} ${event.status}`
      : `${event.agent.ref} ${event.type}`,
  );

const kept = (event: Partial<ActivityEvent> & Pick<ActivityEvent, 'at'>): ActivityEvent =>
  ({
    id: `e${event.at}`,
    type: 'appeared',
    agent: {
      paneId: 'w1:p1',
      ref: 'kirk',
      name: 'kirk',
      workspace: 'app',
      project: 'app',
      worktree: undefined,
    },
    ...event,
  }) as ActivityEvent;

describe('ActivityInbound recorder', () => {
  it.effect('takes the first snapshot as the baseline and records nothing for it', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', status: 'working' })];

      yield* withActivity(tick);

      expect(state.activity).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(fakeLayer())),
  );

  it.effect('records status changes, new and gone agents on later snapshots', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      yield* TestClock.setTime(5_000);
      state.agents = [
        fakeAgent({ paneId: 'w1:p1', name: 'kirk', status: 'idle' }),
        fakeAgent({ paneId: 'w2:p1', name: 'spock', workspaceId: 'w2', status: 'working' }),
      ];

      yield* withActivity(
        Effect.gen(function* () {
          yield* settle;
          state.agents = [
            fakeAgent({ paneId: 'w1:p1', name: 'kirk', status: 'working' }),
            fakeAgent({ paneId: 'w3:p1', name: 'scotty', workspaceId: 'w3' }),
          ];
          yield* tick;
        }),
      );

      expect(summary(state.activity)).toEqual(['spock gone', 'scotty appeared', 'kirk working']);
      expect(state.activity[0]).toMatchObject({
        at: 5_000,
        id: expect.any(String),
        agent: { project: 'app', worktree: 'feature', workspace: 'feature' },
      });
    }).pipe(Effect.scoped, Effect.provide(fakeLayer())),
  );

  it.effect('records nothing while Herdr is away and compares with the last snapshot after', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [
        fakeAgent({ paneId: 'w1:p1', name: 'kirk' }),
        fakeAgent({ paneId: 'w1:p2', name: 'spock' }),
      ];

      yield* withActivity(
        Effect.gen(function* () {
          yield* settle;
          state.available = false;
          yield* tick;
          expect(state.activity).toEqual([]);
          state.available = true;
          state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk' })];
          yield* tick;
          yield* tick;
        }),
      );

      expect(summary(state.activity)).toEqual(['spock gone']);
    }).pipe(Effect.scoped, Effect.provide(fakeLayer())),
  );

  it.effect('drops events beyond the window when it records', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      yield* TestClock.setTime(2 * ACTIVITY_WINDOW_MS);
      state.activity = [kept({ at: 1 })];
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk' })];

      yield* withActivity(
        Effect.gen(function* () {
          yield* settle;
          state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', status: 'blocked' })];
          yield* tick;
        }),
      );

      expect(summary(state.activity)).toEqual(['kirk blocked']);
    }).pipe(Effect.scoped, Effect.provide(fakeLayer())),
  );
});

describe('ActivityInbound.activity', () => {
  it.effect('lists the kept events newest first and says whose agent still runs', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      yield* TestClock.setTime(10_000);
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk' })];
      state.activity = [
        kept({ at: 1_000 }),
        kept({
          at: 2_000,
          type: 'gone',
          agent: { ...kept({ at: 0 }).agent, paneId: 'w1:p2', ref: 'spock', name: 'spock' },
        }),
      ];

      const activity = yield* withActivity(ActivityInbound.use((inbound) => inbound.activity));

      expect(activity.events.map((event) => [event.at, event.agent.ref, event.live])).toEqual([
        [2_000, 'spock', false],
        [1_000, 'kirk', true],
      ]);
    }).pipe(Effect.scoped, Effect.provide(fakeLayer())),
  );

  it.effect('leaves out events older than the window', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      yield* TestClock.setTime(ACTIVITY_WINDOW_MS + 5_000);
      state.activity = [kept({ at: 1_000 }), kept({ at: 10_000 })];

      const activity = yield* withActivity(ActivityInbound.use((inbound) => inbound.activity));

      expect(activity.events.map((event) => event.at)).toEqual([10_000]);
    }).pipe(Effect.scoped, Effect.provide(fakeLayer())),
  );

  it.effect('counts no agent as live while Herdr is away', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      yield* TestClock.setTime(10_000);
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk' })];
      state.activity = [kept({ at: 1_000 })];
      state.available = false;

      const activity = yield* withActivity(ActivityInbound.use((inbound) => inbound.activity));

      expect(activity.events.map((event) => event.live)).toEqual([false]);
    }).pipe(Effect.scoped, Effect.provide(fakeLayer())),
  );
});

describe('ActivityInbound.activityChanges', () => {
  it.effect('emits the timeline at once and again after it changed, never twice the same', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      yield* TestClock.setTime(10_000);
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk' })];

      yield* withActivity(
        Effect.gen(function* () {
          const changes = yield* collect(
            yield* ActivityInbound.use((inbound) => Effect.succeed(inbound.activityChanges)),
          );
          const first: ActivityDto = yield* Queue.take(changes);
          expect(first.events).toEqual([]);

          yield* tick;
          state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', status: 'done' })];
          yield* tick;

          const next = yield* Queue.take(changes);
          expect(next.events.map((event) => [event.type, event.live])).toEqual([['status', true]]);
          yield* tick;
          expect(yield* Queue.size(changes)).toBe(0);
        }),
      );
    }).pipe(Effect.scoped, Effect.provide(fakeLayer())),
  );
});
