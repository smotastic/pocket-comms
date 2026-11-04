import {
  agentRef,
  excerptOf,
  notificationOf,
  stillHolds,
  transcriptFormatOf,
  watchStep,
  type Agent,
  type Attention,
  type Change,
  type Reading,
} from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as FiberMap from 'effect/FiberMap';
import * as Option from 'effect/Option';
import * as Stream from 'effect/Stream';
import { HerdrOutbound } from '../ports/herdr.outbound.port.js';
import { SeenOutbound } from '../ports/memory.outbound.port.js';
import { PushSenderOutbound, PushSubscriptionsOutbound } from '../ports/push.outbound.port.js';
import { TranscriptOutbound } from '../ports/transcript.outbound.port.js';
import { makeBackgroundOf } from './agents.js';

/** How long a change must hold before it notifies, so a passing blocked state stays quiet. */
const HOLD = '10 seconds';

// Watches the agents for as long as the server runs and pushes to every subscribed device when
// one starts to wait for the owner.

export const makeNotify = Effect.gen(function* () {
  const herdrOutbound = yield* HerdrOutbound;
  const seenOutbound = yield* SeenOutbound;
  const transcriptOutbound = yield* TranscriptOutbound;
  const pushSubscriptionsOutbound = yield* PushSubscriptionsOutbound;
  const pushSenderOutbound = yield* PushSenderOutbound;
  const backgroundOf = yield* makeBackgroundOf;

  const excerpt = (agent: Agent, attention: Attention) => {
    const format = transcriptFormatOf(agent);
    if (format === undefined || agent.session === undefined) return Effect.succeed(undefined);
    return transcriptOutbound
      .read({ ref: agentRef(agent), format, session: agent.session, cwd: agent.cwd })
      .pipe(
        Effect.map((transcript) => excerptOf(attention, transcript.entries)),
        Effect.orElseSucceed(() => undefined),
      );
  };

  const send = Effect.fn('Push.send')(function* (change: Change, agent: Agent, project?: string) {
    const notification = notificationOf({
      agent,
      attention: change.attention,
      project,
      excerpt: yield* excerpt(agent, change.attention),
    });
    const subscriptions = yield* pushSubscriptionsOutbound.list;
    yield* Effect.forEach(
      subscriptions,
      (subscription) =>
        pushSenderOutbound.send(subscription, notification).pipe(
          Effect.flatMap((outcome) =>
            outcome === 'gone'
              ? pushSubscriptionsOutbound.remove(subscription.endpoint)
              : Effect.void,
          ),
          // One device that cannot be forgotten must not stop the push to the others.
          Effect.catchTag('PushStoreError', (error) =>
            Effect.logWarning('A gone push device could not be forgotten').pipe(
              Effect.annotateLogs({ reason: error.reason }),
            ),
          ),
        ),
      { concurrency: 'unbounded', discard: true },
    );
  });

  // Waits, then reads Herdr again: the agent and its project while the change still holds.
  const holding = (change: Change) =>
    Effect.gen(function* () {
      yield* Effect.sleep(HOLD);
      const snapshot = yield* herdrOutbound.snapshot.pipe(Effect.option);
      if (Option.isNone(snapshot)) return undefined;
      const { agents, workspaces } = snapshot.value;
      if (!stillHolds(change, agents, yield* seenOutbound.seen)) return undefined;
      const agent = agents.find((candidate) => candidate.paneId === change.paneId);
      if (agent === undefined) return undefined;
      const project = workspaces.find((workspace) => workspace.id === agent.workspaceId)?.project;
      return { agent, project };
    });

  const quiet = (agent: Agent) => Effect.map(backgroundOf(agent), (work) => work.length === 0);

  // Only a change that still holds is sent. A done agent with background work is not done yet
  // (spec 020): its change waits until two rounds in a row find no work, so an agent that wakes
  // up when its work ends has 10 s to start the turn that brings its own change. Sending is not
  // interrupted by a newer change of the same agent; only the wait is.
  const deliver = (change: Change, seenAs: Agent) =>
    Effect.gen(function* () {
      let wasQuiet = change.attention === 'blocked' || (yield* quiet(seenAs));
      let held = yield* holding(change);
      while (held !== undefined && change.attention === 'done') {
        const isQuiet = yield* quiet(held.agent);
        if (wasQuiet && isQuiet) break;
        wasQuiet = isQuiet;
        held = yield* holding(change);
      }
      if (held === undefined) return;
      yield* send(change, held.agent, held.project).pipe(
        Effect.catchTag('PushStoreError', (error) =>
          Effect.logWarning('Push devices could not be read').pipe(
            Effect.annotateLogs({ reason: error.reason }),
          ),
        ),
        Effect.uninterruptible,
      );
    });

  const watch = Effect.gen(function* () {
    // One pending change per agent: a newer one replaces it and starts the wait again.
    const pending = yield* FiberMap.make<string>();
    let reading: Reading | undefined;
    yield* herdrOutbound.changes.pipe(
      Stream.runForEach(() =>
        Effect.gen(function* () {
          // While Herdr cannot be read, the last reading stays the one to compare with.
          const snapshot = yield* herdrOutbound.snapshot.pipe(Effect.option);
          if (Option.isNone(snapshot)) return;
          const step = watchStep(reading, snapshot.value.agents);
          reading = step.reading;
          for (const change of step.changes) {
            const agent = snapshot.value.agents.find(
              (candidate) => candidate.paneId === change.paneId,
            );
            if (agent === undefined) continue;
            yield* FiberMap.run(pending, change.paneId, deliver(change, agent));
          }
        }),
      ),
    );
  }).pipe(Effect.scoped, Effect.withSpan('Push.watch'));

  return { watch };
});
