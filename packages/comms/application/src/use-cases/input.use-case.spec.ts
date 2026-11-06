import { describe, expect, it } from '@effect/vitest';
import { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { AgentNotFoundError, HerdrRejectedError } from '../errors.js';
import { AgentsInbound } from '../ports/agents.inbound.port.js';
import { FAKE_IMAGES_FOLDER, fakeAgent, fakeLayer, FakeState } from '../testing/fakes.js';

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

  it.effect('sends the paths of the attached images after the text', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;
      const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
      state.images.set('a'.repeat(26), { kind: 'jpeg', bytes, savedAt: 0 });
      state.images.set('b'.repeat(26), { kind: 'png', bytes, savedAt: 0 });

      yield* AgentsInbound.use((inbound) =>
        inbound.prompt('kirk', ' Why? ', ['a'.repeat(26), 'b'.repeat(26)]),
      );

      expect(state.calls.at(-1)?.params).toBe(
        `Why?\n\n${FAKE_IMAGES_FOLDER}/${'a'.repeat(26)}.jpg\n${FAKE_IMAGES_FOLDER}/${'b'.repeat(26)}.png`,
      );
    }).pipe(Effect.provide(layer())),
  );

  it.effect('sends only the paths when there is no text', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;
      state.images.set('a'.repeat(26), { kind: 'jpeg', bytes: new Uint8Array(), savedAt: 0 });

      yield* AgentsInbound.use((inbound) => inbound.prompt('kirk', '', ['a'.repeat(26)]));

      expect(state.calls.at(-1)?.params).toBe(`${FAKE_IMAGES_FOLDER}/${'a'.repeat(26)}.jpg`);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('sends nothing when an image is unknown', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;

      const error = yield* AgentsInbound.use((inbound) =>
        inbound.prompt('kirk', 'hi', ['c'.repeat(26)]),
      ).pipe(Effect.flip);

      expect(error).toEqual(
        new InvalidInputError({
          issues: [{ field: 'imageIds', message: `${'c'.repeat(26)} is not an attached image.` }],
        }),
      );
      expect(state.calls.some((call) => call.method === 'prompt')).toBe(false);
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

describe('AgentsInbound.type', () => {
  it.effect('types the text into the pane without submitting it', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;

      yield* AgentsInbound.use((inbound) => inbound.type('kirk', ' Use SQLite\ninstead '));

      expect(state.calls.at(-1)).toEqual({
        method: 'typeText',
        target: 'w1:p1',
        params: 'Use SQLite instead',
      });
      expect(
        state.calls.some((call) => call.method === 'prompt' || call.method === 'sendKeys'),
      ).toBe(false);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('types nothing when the text is blank', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;

      const error = yield* AgentsInbound.use((inbound) => inbound.type('kirk', ' \n ')).pipe(
        Effect.flip,
      );

      expect(error).toBeInstanceOf(InvalidInputError);
      expect(state.calls.some((call) => call.method === 'typeText')).toBe(false);
    }).pipe(Effect.provide(layer())),
  );
});

describe('AgentsInbound input in the activity timeline', () => {
  it.effect('records a prompt Herdr took with its excerpt and images', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;
      const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
      state.images.set('a'.repeat(26), { kind: 'jpeg', bytes, savedAt: 0 });

      yield* AgentsInbound.use((inbound) =>
        inbound.prompt('kirk', '\nFix the failing test\nand run it', ['a'.repeat(26)]),
      );

      expect(state.activity).toEqual([
        {
          id: expect.any(String),
          at: expect.any(Number),
          type: 'prompt',
          excerpt: 'Fix the failing test',
          images: 1,
          agent: {
            paneId: 'w1:p1',
            ref: 'kirk',
            name: 'kirk',
            workspace: 'app',
            project: 'app',
            worktree: undefined,
          },
        },
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('records keys Herdr took', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;

      yield* AgentsInbound.use((inbound) => inbound.sendKeys('kirk', ['2', 'enter']));

      expect(state.activity).toMatchObject([{ type: 'keys', keys: ['2', 'enter'] }]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('records typed text with its excerpt', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;

      yield* AgentsInbound.use((inbound) => inbound.type('kirk', 'Use SQLite instead'));

      expect(state.activity).toMatchObject([{ type: 'typed', excerpt: 'Use SQLite instead' }]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('records nothing when Herdr refuses the input', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;
      state.rejects.set('w1:p1', 'pane_not_found');

      yield* AgentsInbound.use((inbound) => inbound.prompt('kirk', 'hello')).pipe(Effect.ignore);
      yield* AgentsInbound.use((inbound) => inbound.sendKeys('kirk', ['enter'])).pipe(
        Effect.ignore,
      );

      expect(state.activity).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );
});
