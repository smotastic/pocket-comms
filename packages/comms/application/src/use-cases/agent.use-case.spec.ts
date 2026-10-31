import { describe, expect, it } from '@effect/vitest';
import { completionKey } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { AgentNotFoundError } from '../errors.js';
import { AgentsInbound } from '../ports/agents.inbound.port.js';
import { fakeAgent, fakeLayer, FakeState } from '../testing/fakes.js';

const layer = () => AgentsInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

describe('AgentsInbound.agent', () => {
  it.effect('finds an agent by its name', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk' })];

      const agent = yield* AgentsInbound.use((inbound) => inbound.agent('kirk'));

      expect(agent).toMatchObject({ ref: 'kirk', paneId: 'w1:p1' });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('finds an agent without a name by its pane id', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1' })];

      const agent = yield* AgentsInbound.use((inbound) => inbound.agent('w1:p1'));

      expect(agent.ref).toBe('w1:p1');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reports an unknown agent as not found', () =>
    Effect.gen(function* () {
      const error = yield* AgentsInbound.use((inbound) => inbound.agent('nobody')).pipe(
        Effect.flip,
      );

      expect(error).toEqual(new AgentNotFoundError({ ref: 'nobody' }));
    }).pipe(Effect.provide(layer())),
  );
});

describe('AgentsInbound.markSeen', () => {
  it.effect('remembers the current completion of a done agent', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const done = fakeAgent({ paneId: 'w1:p1', name: 'kirk', status: 'done', completion: 3 });
      state.agents = [done];

      yield* AgentsInbound.use((inbound) => inbound.markSeen('kirk'));

      expect([...state.seen]).toEqual([completionKey(done)]);
      const agent = yield* AgentsInbound.use((inbound) => inbound.agent('kirk'));
      expect(agent.needsYou).toBe(false);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('remembers nothing for an agent that is not done', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', status: 'working' })];

      yield* AgentsInbound.use((inbound) => inbound.markSeen('kirk'));

      expect(state.seen.size).toBe(0);
    }).pipe(Effect.provide(layer())),
  );
});
