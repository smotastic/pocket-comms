import { describe, expect, it } from '@effect/vitest';
import { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { AgentNotFoundError, HerdrRejectedError } from '../errors.js';
import { AgentsInbound } from '../ports/agents.inbound.port.js';
import { fakeAgent, fakeLayer, FakeState } from '../testing/fakes.js';

const layer = () => AgentsInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const withKirk = Effect.gen(function* () {
  const state = yield* FakeState;
  state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', status: 'blocked' })];
  return state;
});

describe('AgentsInbound.screen', () => {
  it.effect("reads the agent's visible screen by its pane", () =>
    Effect.gen(function* () {
      const state = yield* withKirk;
      state.screens.set('w1:p1', '\u001b[1mAllow?\u001b[0m');

      const screen = yield* AgentsInbound.use((inbound) => inbound.screen('kirk'));

      expect(screen).toBe('\u001b[1mAllow?\u001b[0m');
    }).pipe(Effect.provide(layer())),
  );
});

describe('AgentsInbound.prompt', () => {
  it.effect('sends the trimmed text to the agent', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;

      yield* AgentsInbound.use((inbound) => inbound.prompt('kirk', '  hello\n'));

      expect(state.calls.at(-1)).toEqual({ method: 'prompt', target: 'w1:p1', params: 'hello' });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('sends nothing for a blank text', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;

      const error = yield* AgentsInbound.use((inbound) => inbound.prompt('kirk', ' ')).pipe(
        Effect.flip,
      );

      expect(error).toBeInstanceOf(InvalidInputError);
      expect(state.calls.some((call) => call.method === 'prompt')).toBe(false);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reports an unknown agent as not found', () =>
    Effect.gen(function* () {
      yield* withKirk;

      const error = yield* AgentsInbound.use((inbound) => inbound.prompt('nobody', 'hi')).pipe(
        Effect.flip,
      );

      expect(error).toEqual(new AgentNotFoundError({ ref: 'nobody' }));
    }).pipe(Effect.provide(layer())),
  );

  it.effect('passes on a refusal of Herdr', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;
      state.rejects.set('w1:p1', 'agent_not_ready');

      const error = yield* AgentsInbound.use((inbound) => inbound.prompt('kirk', 'hi')).pipe(
        Effect.flip,
      );

      expect(error).toBeInstanceOf(HerdrRejectedError);
    }).pipe(Effect.provide(layer())),
  );
});

describe('AgentsInbound.sendKeys', () => {
  it.effect('sends the keys in order', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;

      yield* AgentsInbound.use((inbound) => inbound.sendKeys('kirk', ['down', 'enter']));

      expect(state.calls.at(-1)).toEqual({
        method: 'sendKeys',
        target: 'w1:p1',
        params: ['down', 'enter'],
      });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('sends nothing when one key is not allowed', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;

      const error = yield* AgentsInbound.use((inbound) =>
        inbound.sendKeys('kirk', ['enter', 'ctrl+d']),
      ).pipe(Effect.flip);

      expect(error).toBeInstanceOf(InvalidInputError);
      expect(state.calls.some((call) => call.method === 'sendKeys')).toBe(false);
    }).pipe(Effect.provide(layer())),
  );
});
