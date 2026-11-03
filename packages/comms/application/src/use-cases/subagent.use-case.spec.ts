import { describe, expect, it } from '@effect/vitest';
import type { BackgroundItem, TranscriptEntry } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Layer from 'effect/Layer';
import * as PubSub from 'effect/PubSub';
import * as Queue from 'effect/Queue';
import * as Stream from 'effect/Stream';
import type { SubagentEventDto } from '../dto/agent.dto.js';
import { AgentsInbound } from '../ports/agents.inbound.port.js';
import { fakeAgent, fakeLayer, FakeState, subagentKey } from '../testing/fakes.js';
import { collect, settle } from '../testing/streams.js';

const layer = () => AgentsInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const at = 1_000;
const prompt: TranscriptEntry = { type: 'user', id: 'su1', at, text: 'Review the diff' };
const reading: TranscriptEntry = {
  type: 'tool',
  id: 'st1',
  at,
  verb: 'Read',
  target: 'src/a.ts',
  outcome: 'pending',
};
const review: BackgroundItem = {
  id: 'toolu-rev',
  kind: 'subagent',
  description: 'Review the diff',
  startedAt: at,
  inBackground: true,
  subagent: 'a1',
};

// A Claude agent `kirk` in session s1 with the subagent a1, still running in the background.
const kirkWithSubagent = Effect.gen(function* () {
  const state = yield* FakeState;
  state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 's1', status: 'done' })];
  state.transcripts.set('s1', { entries: [], modifiedAt: at, background: [review] });
  state.transcripts.set(subagentKey('s1', 'a1'), { entries: [prompt], modifiedAt: at });
  state.subagentMetas.set(subagentKey('s1', 'a1'), {
    description: 'Review the diff',
    agentType: 'general-purpose',
    inBackground: true,
  });
  return state;
});

describe('AgentsInbound.subagent', () => {
  it.effect("reads a running subagent's conversation and what it is", () =>
    Effect.gen(function* () {
      yield* kirkWithSubagent;

      const subagent = yield* AgentsInbound.use((inbound) => inbound.subagent('kirk', 'a1'));

      expect(subagent).toEqual({
        id: 'a1',
        description: 'Review the diff',
        agentType: 'general-purpose',
        running: true,
        inBackground: true,
        entries: [prompt],
        activity: 'Thinking…',
      });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reads a subagent that ended', () =>
    Effect.gen(function* () {
      const state = yield* kirkWithSubagent;
      state.transcripts.set('s1', { entries: [], modifiedAt: at, background: [] });

      const subagent = yield* AgentsInbound.use((inbound) => inbound.subagent('kirk', 'a1'));

      expect(subagent).toMatchObject({ id: 'a1', description: 'Review the diff', running: false });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('names a subagent without a meta file by its call', () =>
    Effect.gen(function* () {
      const state = yield* kirkWithSubagent;
      state.subagentMetas.clear();

      const subagent = yield* AgentsInbound.use((inbound) => inbound.subagent('kirk', 'a1'));

      expect(subagent).toMatchObject({ description: 'Review the diff', agentType: undefined });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('fails for a subagent the session does not have', () =>
    Effect.gen(function* () {
      yield* kirkWithSubagent;

      const error = yield* AgentsInbound.use((inbound) => inbound.subagent('kirk', 'b2')).pipe(
        Effect.flip,
      );

      expect(error).toMatchObject({ _tag: 'SubagentNotFoundError', ref: 'kirk', subagent: 'b2' });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('fails for a subagent Claude recorded without a conversation', () =>
    Effect.gen(function* () {
      const state = yield* kirkWithSubagent;
      state.transcripts.delete(subagentKey('s1', 'a1'));

      const error = yield* AgentsInbound.use((inbound) => inbound.subagent('kirk', 'a1')).pipe(
        Effect.flip,
      );

      expect(error._tag).toBe('SubagentNotFoundError');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('fails for an agent whose sessions have no subagents', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'spock', kind: 'pi', session: 's2' })];

      const error = yield* AgentsInbound.use((inbound) => inbound.subagent('spock', 'a1')).pipe(
        Effect.flip,
      );

      expect(error._tag).toBe('SubagentNotFoundError');
    }).pipe(Effect.provide(layer())),
  );
});

describe('AgentsInbound.subagentEvents', () => {
  const firstTwo = (events: Queue.Queue<SubagentEventDto>) =>
    Effect.map(Effect.all([Queue.take(events), Queue.take(events)]), (taken) =>
      [...taken].sort((a, b) => b.type.localeCompare(a.type)),
    );

  it.effect('emits the subagent and its entries, then new entries and its end', () =>
    Effect.gen(function* () {
      const state = yield* kirkWithSubagent;
      const events = yield* collect(
        yield* AgentsInbound.use((inbound) => inbound.subagentEvents('kirk', 'a1')),
      );

      expect(yield* firstTwo(events)).toEqual([
        { type: 'subagent', subagent: expect.objectContaining({ id: 'a1', running: true }) },
        { type: 'entries', reset: true, entries: [prompt], activity: 'Thinking…' },
      ]);
      yield* settle;
      yield* PubSub.publish(state.transcriptAppends, {
        session: subagentKey('s1', 'a1'),
        entries: [reading],
      });
      expect(yield* Queue.take(events)).toEqual({
        type: 'entries',
        reset: false,
        entries: [reading],
        activity: 'Reading src/a.ts…',
      });

      state.transcripts.set('s1', { entries: [], modifiedAt: at, background: [] });
      yield* PubSub.publish(state.herdrChanges, undefined);
      expect(yield* Queue.take(events)).toEqual({
        type: 'subagent',
        subagent: expect.objectContaining({ id: 'a1', running: false }),
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  // Each run ends only when the stream does; a stream that kept going would time the test out.
  it.effect.each([
    ['is gone', []],
    ['starts another session', [fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 's2' })]],
  ] as const)('ends when the parent agent %s', ([, agents]) =>
    Effect.gen(function* () {
      const state = yield* kirkWithSubagent;
      const stream = yield* AgentsInbound.use((inbound) => inbound.subagentEvents('kirk', 'a1'));
      const run = yield* Stream.runDrain(stream).pipe(Effect.forkScoped);
      yield* settle;

      state.agents = [...agents];
      yield* PubSub.publish(state.herdrChanges, undefined);

      yield* Fiber.join(run);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('fails at once for an unknown subagent', () =>
    Effect.gen(function* () {
      yield* kirkWithSubagent;

      const error = yield* AgentsInbound.use((inbound) =>
        inbound.subagentEvents('kirk', 'b2'),
      ).pipe(Effect.flip);

      expect(error._tag).toBe('SubagentNotFoundError');
    }).pipe(Effect.provide(layer())),
  );
});
