import { describe, expect, it } from '@effect/vitest';
import { InvalidInputError, type Agent, type TranscriptEntry } from '@pocket-comms/comms-domain';
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

  it.effect('fails for an unknown agent and types nothing', () =>
    Effect.gen(function* () {
      const state = yield* withKirk;

      const error = yield* AgentsInbound.use((inbound) => inbound.type('spock', 'hi')).pipe(
        Effect.flip,
      );

      expect(error).toBeInstanceOf(AgentNotFoundError);
      expect(state.calls.some((call) => call.method === 'typeText')).toBe(false);
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

describe('AgentsInbound.answer', () => {
  const asks = {
    type: 'tool',
    id: 'toolu-q',
    at: 1,
    verb: 'Used',
    target: 'AskUserQuestion',
    questions: [
      {
        header: 'Color',
        text: 'Pick a color?',
        options: [{ label: 'Red' }, { label: 'Green' }, { label: 'Blue' }, { label: 'Yellow' }],
        multiple: false,
      },
      {
        header: 'Pets',
        text: 'Which pets?',
        options: [{ label: 'Cat' }, { label: 'Dog' }, { label: 'Fish' }],
        multiple: true,
      },
    ],
    outcome: 'pending',
  } satisfies TranscriptEntry;
  const dialog = [
    '←  ☐ Color  ☐ Pets  ✔ Submit  →',
    'Pick a color?',
    '❯ 1. Red',
    'Enter to select · Tab/Arrow keys to navigate · Esc to cancel',
  ].join('\n');

  const waiting = (
    agent: Partial<Agent> = {},
    entries: Array<TranscriptEntry> = [asks],
    screen = dialog,
  ) =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [
        fakeAgent({ paneId: 'w1:p1', name: 'kirk', status: 'blocked', session: 's1', ...agent }),
      ];
      state.transcripts.set('s1', { entries, modifiedAt: 1 });
      state.screens.set('w1:p1', screen);
      return state;
    });

  const answer = (answers: ReadonlyArray<ReadonlyArray<number>>, call = 'toolu-q') =>
    AgentsInbound.use((inbound) => inbound.answer('kirk', call, answers));

  const pressed = (state: FakeState['Service']) =>
    state.calls.filter((call) => call.method === 'sendKeys');

  it.effect('presses the keys that answer and submit the dialog, and records the answer', () =>
    Effect.gen(function* () {
      const state = yield* waiting();

      yield* answer([[3], [0, 2]]);

      expect(pressed(state)).toEqual([
        { method: 'sendKeys', target: 'w1:p1', params: ['4', '1', '3', 'right', '1'] },
      ]);
      expect(state.activity).toMatchObject([{ type: 'answered', excerpt: 'Yellow; Cat, Fish' }]);
    }).pipe(Effect.provide(layer())),
  );

  // Herdr reports a Claude agent whose question waits as done, not blocked.
  it.effect('answers whatever status Herdr reports', () =>
    Effect.gen(function* () {
      const state = yield* waiting({ status: 'done' });

      yield* answer([[3], [0, 2]]);

      expect(pressed(state)).toHaveLength(1);
    }).pipe(Effect.provide(layer())),
  );

  const refusals: ReadonlyArray<[string, Partial<Agent>, Array<TranscriptEntry>, string, string]> =
    [
      ['a Pi agent', { kind: 'pi' }, [asks], dialog, 'toolu-q'],
      ['another call', {}, [asks], dialog, 'toolu-other'],
      [
        'a call that is not the latest entry',
        {},
        [asks, { type: 'assistant', id: 'a1', at: 2, text: 'Thanks.' }],
        dialog,
        'toolu-q',
      ],
      ['an answered call', {}, [{ ...asks, outcome: 'ok' }], dialog, 'toolu-q'],
      ['a screen without the question', {}, [asks], '❯ Try "fix the tests"', 'toolu-q'],
    ];

  it.effect.each(refusals)('refuses %s and presses nothing', ([, agent, entries, screen, call]) =>
    Effect.gen(function* () {
      const state = yield* waiting(agent, entries, screen);

      const error = yield* answer([[3], [0, 2]], call).pipe(Effect.flip);

      expect(error._tag).toBe('QuestionNotWaitingError');
      expect(pressed(state)).toEqual([]);
      expect(state.activity).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses answers that do not fit the call and presses nothing', () =>
    Effect.gen(function* () {
      const state = yield* waiting();

      const error = yield* answer([[3, 1], [0]]).pipe(Effect.flip);

      expect(error).toEqual(
        new InvalidInputError({
          issues: [{ field: 'answers', message: 'Choose only one option for "Pick a color?".' }],
        }),
      );
      expect(pressed(state)).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );
});
