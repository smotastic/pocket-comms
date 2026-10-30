import { describe, expect, it } from '@effect/vitest';
import type { TranscriptEntry } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as PubSub from 'effect/PubSub';
import * as Queue from 'effect/Queue';
import { TranscriptUnavailableError } from '../errors.js';
import { AgentsInbound } from '../ports/agents.inbound.port.js';
import { fakeAgent, fakeLayer, FakeState } from '../testing/fakes.js';
import { collect, settle } from '../testing/streams.js';

const layer = () => AgentsInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const at = 1_000;
const prompt: TranscriptEntry = { type: 'user', id: 'u1', at, text: 'Run the tests' };
const running: TranscriptEntry = {
  type: 'tool',
  id: 't1',
  at,
  verb: 'Ran',
  target: 'pnpm test',
  outcome: 'pending',
};

describe('AgentsInbound.transcript', () => {
  it.effect('reads the entries of the session and what the agent does now', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 's1' })];
      state.transcripts.set('s1', { entries: [prompt, running], modifiedAt: at });

      const transcript = yield* AgentsInbound.use((inbound) => inbound.transcript('kirk'));

      expect(transcript).toEqual({ entries: [prompt, running], activity: 'Running pnpm test…' });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('has no transcript for an agent kind without a session format', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', kind: 'codex', session: 's1' })];

      const error = yield* AgentsInbound.use((inbound) => inbound.transcript('w1:p1')).pipe(
        Effect.flip,
      );

      expect(error).toBeInstanceOf(TranscriptUnavailableError);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('has no transcript for an agent without a session id', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1' })];

      const error = yield* AgentsInbound.use((inbound) => inbound.transcript('w1:p1')).pipe(
        Effect.flip,
      );

      expect(error).toBeInstanceOf(TranscriptUnavailableError);
    }).pipe(Effect.provide(layer())),
  );
});

describe('AgentsInbound.agentEvents', () => {
  it.effect('emits the agent at once, then new entries and status changes', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 's1' })];
      state.transcripts.set('s1', { entries: [prompt], modifiedAt: at });
      const events = yield* collect(
        yield* AgentsInbound.use((inbound) => inbound.agentEvents('kirk')),
      );

      expect(yield* Queue.take(events)).toEqual({
        type: 'agent',
        agent: expect.objectContaining({ ref: 'kirk', status: 'idle' }),
      });
      yield* settle;
      yield* PubSub.publish(state.transcriptAppends, { session: 's1', entries: [running] });
      expect(yield* Queue.take(events)).toEqual({
        type: 'entries',
        entries: [running],
        activity: 'Running pnpm test…',
      });
      state.agents = [
        fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 's1', status: 'working' }),
      ];
      yield* PubSub.publish(state.herdrChanges, undefined);
      expect(yield* Queue.take(events)).toEqual({
        type: 'agent',
        agent: expect.objectContaining({ ref: 'kirk', status: 'working' }),
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('fails at once for an unknown agent', () =>
    Effect.gen(function* () {
      const error = yield* AgentsInbound.use((inbound) => inbound.agentEvents('nobody')).pipe(
        Effect.flip,
      );

      expect(error._tag).toBe('AgentNotFoundError');
    }).pipe(Effect.provide(layer())),
  );
});
