import {
  activityBetween,
  activitySubject,
  isLiveIn,
  keepActivity,
  type Agent,
  type Observed,
} from '@pocket-comms/comms-domain';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';
import type { ActivityDto } from '../dto/activity.dto.js';
import { ActivityStoreOutbound } from '../ports/activity-store.outbound.port.js';
import {
  MultiplexerOutbound,
  type MultiplexerSnapshot,
} from '../ports/multiplexer.outbound.port.js';
import { makeRecordActivity } from './activity-log.js';

// The activity timeline (spec 017). A recorder in the background compares each Herdr snapshot
// with the one before, whether or not anyone has the app open.

const observe = (snapshot: MultiplexerSnapshot): ReadonlyArray<Observed> => {
  const workspaces = new Map(snapshot.workspaces.map((workspace) => [workspace.id, workspace]));
  return snapshot.agents.map((agent) => ({
    agent,
    subject: activitySubject(agent, workspaces.get(agent.workspaceId)),
  }));
};

export const makeActivity = Effect.gen(function* () {
  const herdrOutbound = yield* MultiplexerOutbound;
  const store = yield* ActivityStoreOutbound;
  const { record } = yield* makeRecordActivity;

  // The first snapshot is only the baseline. While Herdr is away the last snapshot stays, so its
  // return is compared with what was there before.
  let previous: ReadonlyArray<Observed> | undefined;
  const observeOnce = herdrOutbound.snapshot.pipe(
    Effect.flatMap((snapshot) => {
      const current = observe(snapshot);
      const changes = previous === undefined ? [] : activityBetween(previous, current);
      previous = current;
      return record(changes);
    }),
    Effect.catchTag('MultiplexerUnavailableError', () => Effect.void),
    Effect.withSpan('Activity.observe'),
  );
  yield* Stream.concat(Stream.succeed(undefined), herdrOutbound.changes).pipe(
    Stream.runForEach(() => observeOnce),
    Effect.forkScoped,
  );

  const activity = Effect.gen(function* () {
    const events = yield* store.events;
    const now = yield* Clock.currentTimeMillis;
    const agents = yield* herdrOutbound.snapshot.pipe(
      Effect.map((snapshot) => snapshot.agents),
      Effect.catchTag('MultiplexerUnavailableError', () =>
        Effect.succeed<ReadonlyArray<Agent>>([]),
      ),
    );
    return {
      events: [...keepActivity(events, now)]
        .reverse()
        .map((event) => ({ ...event, live: isLiveIn(event.agent, agents) })),
    } satisfies ActivityDto;
  }).pipe(Effect.withSpan('Activity.activity'));

  // Herdr's ticks also renew which agents are live and drop events that grew too old.
  const activityChanges: Stream.Stream<ActivityDto> = Stream.concat(
    Stream.succeed(undefined),
    Stream.merge(herdrOutbound.changes, store.changes),
  ).pipe(
    Stream.mapEffect(() => activity),
    Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  );

  return { activity, activityChanges };
});
