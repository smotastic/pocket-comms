import { describe, expect, it } from '@effect/vitest';
import type { BrainstormEntry, ProposalEntry } from '@pocket-comms/comms-domain';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Queue from 'effect/Queue';
import * as TestClock from 'effect/testing/TestClock';
import type * as Scope from 'effect/Scope';
import type { BrainstormStateDto } from '../dto/brainstorm.dto.js';
import {
  BrainstormBusyError,
  BrainstormNotSetUpError,
  GiteaUnavailableError,
  NoGiteaRemoteError,
  ProposalDecidedError,
  ProposalNotFoundError,
} from '../errors.js';
import { fakeIssue, fakeLayer, FakeState } from '../testing/fakes.js';
import { collect } from '../testing/streams.js';
import { BRAINSTORM_INSTRUCTIONS, makeBrainstorm } from './brainstorm.use-case.js';

type Brainstorm = Effect.Success<typeof makeBrainstorm>;

const ready = (state: BrainstormStateDto) => {
  if (state._tag !== 'Ready') throw new Error(`The chat is ${state._tag}.`);
  return state;
};

/** Lets the background turn run until it is done. */
const idle = (brainstorm: Brainstorm) =>
  Effect.gen(function* () {
    for (let tries = 0; tries < 1_000; tries += 1) {
      if (!ready(yield* brainstorm.state).answering) return;
      yield* Effect.yieldNow;
    }
    throw new Error('The turn did not end.');
  });

const entries = (brainstorm: Brainstorm) =>
  Effect.map(brainstorm.state, (state) => ready(state).entries);

const strip = (entry: BrainstormEntry) => {
  const { id: _id, at: _at, ...rest } = entry;
  return rest;
};

const proposalIn = (all: ReadonlyArray<BrainstormEntry>) =>
  all.find((entry): entry is ProposalEntry => entry.type === 'proposal');

const turnInputs = (state: FakeState['Service']) => state.turns.map((turn) => turn.input);

// Runs a test with a fresh chat built after `arrange`, in a scope that ends its turns.
const run = (
  test: (
    brainstorm: Brainstorm,
    state: FakeState['Service'],
  ) => Effect.Effect<void, unknown, Scope.Scope>,
  arrange: (state: FakeState['Service']) => void = () => undefined,
) =>
  Effect.gen(function* () {
    const state = yield* FakeState;
    arrange(state);
    const brainstorm = yield* makeBrainstorm;
    yield* test(brainstorm, state);
  }).pipe(Effect.scoped, Effect.provide(fakeLayer()));

const propose = (input: Record<string, string>) => ({ tool: 'propose_issue', input });

describe('the brainstorm chat', () => {
  it.effect('adds the message, streams Pi’s answer and saves the chat', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ text: 'Nice idea. Which project?' }]);

        yield* brainstorm.send('  Idea: dark mode  ');
        yield* idle(brainstorm);

        expect((yield* entries(brainstorm)).map(strip)).toEqual([
          { type: 'user', text: 'Idea: dark mode' },
          { type: 'assistant', text: 'Nice idea. Which project?' },
        ]);
        expect(state.turns[0]).toMatchObject({
          instructions: BRAINSTORM_INSTRUCTIONS,
          input: 'Idea: dark mode',
          state: Option.none(),
        });
        expect(state.turns[0]?.tools.map((tool) => tool.name)).toEqual([
          'list_projects',
          'list_open_issues',
          'read_project_doc',
          'propose_issue',
        ]);
        expect(state.storedChat?.entries).toHaveLength(2);
        expect(state.storedChat?.runtime).toEqual(Option.some({ adapter: 'scripted', state: 1 }));
      }),
    ),
  );

  it.effect('continues the next turn from the state the last one ended with', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        yield* brainstorm.send('One');
        yield* idle(brainstorm);
        yield* brainstorm.send('Two');
        yield* idle(brainstorm);

        expect(state.turns[1]?.state).toEqual(Option.some({ adapter: 'scripted', state: 1 }));
      }),
    ),
  );

  it.effect('refuses a message while Pi answers', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        const hold = yield* Deferred.make<void>();
        state.script.push([{ until: Deferred.await(hold) }, { text: 'Done.' }]);

        yield* brainstorm.send('First');
        yield* Effect.yieldNow;
        expect(ready(yield* brainstorm.state).answering).toBe(true);
        expect(yield* brainstorm.send('Second').pipe(Effect.flip)).toEqual(
          new BrainstormBusyError(),
        );

        yield* Deferred.succeed(hold, undefined);
        yield* idle(brainstorm);
        expect((yield* entries(brainstorm)).map((entry) => entry.type)).toEqual([
          'user',
          'assistant',
        ]);
      }),
    ),
  );

  it.effect('refuses an empty message', () =>
    run((brainstorm) =>
      Effect.gen(function* () {
        const error = yield* brainstorm.send('   ').pipe(Effect.flip);
        expect(error._tag).toBe('InvalidInputError');
      }),
    ),
  );

  it.effect('keeps the conversation and shows why a turn failed', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ text: 'First answer.' }]);
        state.script.push([{ fail: 'The model cannot be reached.' }]);

        yield* brainstorm.send('One');
        yield* idle(brainstorm);
        yield* brainstorm.send('Two');
        yield* idle(brainstorm);

        expect((yield* entries(brainstorm)).map(strip)).toEqual([
          { type: 'user', text: 'One' },
          { type: 'assistant', text: 'First answer.' },
          { type: 'user', text: 'Two' },
          { type: 'failed', reason: 'The model cannot be reached.' },
        ]);
        yield* brainstorm.send('Three');
        yield* idle(brainstorm);
      }),
    ),
  );

  it.effect('says that it is not set up and takes no message', () =>
    run(
      (brainstorm) =>
        Effect.gen(function* () {
          expect(yield* brainstorm.state).toEqual({
            _tag: 'NotSetUp',
            reason: 'COMMS_BRAINSTORM_MODEL is not set.',
          });
          expect(yield* brainstorm.send('Hi').pipe(Effect.flip)).toEqual(
            new BrainstormNotSetUpError({ reason: 'COMMS_BRAINSTORM_MODEL is not set.' }),
          );
        }),
      (state) => {
        state.notSetUp = 'COMMS_BRAINSTORM_MODEL is not set.';
      },
    ),
  );

  it.effect('starts with the stored chat after a restart', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          expect((yield* entries(brainstorm)).map(strip)).toEqual([{ type: 'user', text: 'Kept' }]);
          yield* brainstorm.send('Again');
          yield* idle(brainstorm);
          expect(state.turns[0]?.sessionId).toBe('chat-1');
          expect(state.turns[0]?.state).toEqual(Option.some({ adapter: 'scripted', state: 4 }));
        }),
      (state) => {
        state.storedChat = {
          id: 'chat-1',
          entries: [{ type: 'user', id: 'u1', at: 1, text: 'Kept' }],
          runtime: Option.some({ adapter: 'scripted', state: 4 }),
        };
      },
    ),
  );

  it.effect('starts an empty chat on reset and stops a running answer', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ until: Effect.never }]);
        yield* brainstorm.send('Hold on');
        yield* Effect.yieldNow;

        yield* brainstorm.reset();

        expect(yield* brainstorm.state).toEqual({
          _tag: 'Ready',
          entries: [],
          answering: false,
          live: '',
        });
        expect(state.storedChat?.entries).toEqual([]);
        expect(state.storedChat?.runtime).toEqual(Option.none());
      }),
    ),
  );

  it.effect('keeps a late write of a stopped turn out of the new chat', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ until: Effect.never }]);
        yield* brainstorm.send('Hold on');
        yield* Effect.yieldNow;
        yield* brainstorm.reset();

        // Pi's tools run outside the turn and may finish after it was stopped.
        const propose = state.turns[0]?.tools.find((tool) => tool.name === 'propose_issue');
        yield* propose?.run({ project: 'app', title: 'Late', body: '' }) ?? Effect.void;

        expect(yield* entries(brainstorm)).toEqual([]);
      }),
    ),
  );

  it.effect('ends a turn that takes longer than five minutes and says so', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ until: Effect.never }]);
        yield* brainstorm.send('Hello?');
        yield* Effect.yieldNow;

        yield* TestClock.adjust('5 minutes');
        yield* idle(brainstorm);

        expect((yield* entries(brainstorm)).map(strip).at(-1)).toEqual({
          type: 'failed',
          reason: 'Pi did not answer within 5 minutes.',
        });
      }),
    ),
  );

  it.effect('shows a turn that failed in an unexpected way', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ die: 'boom' }]);
        yield* brainstorm.send('Hi');
        yield* idle(brainstorm);

        expect((yield* entries(brainstorm)).map(strip).at(-1)).toEqual({
          type: 'failed',
          reason: 'The turn failed unexpectedly.',
        });
      }),
    ),
  );

  it.effect('follows the state and the text Pi writes', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ text: 'Hello' }]);
        const events = yield* collect(brainstorm.events);
        expect(yield* Queue.take(events)).toMatchObject({ type: 'state' });

        yield* brainstorm.send('Hi');
        yield* idle(brainstorm);

        const seen = [];
        for (;;) {
          const event = yield* Queue.poll(events);
          if (Option.isNone(event)) break;
          seen.push(event.value);
        }
        expect(seen).toContainEqual({ type: 'delta', text: 'Hello' });
        const last = seen.at(-1);
        expect(last?.type === 'state' && ready(last.state)).toMatchObject({
          answering: false,
          live: '',
        });
      }),
    ),
  );
});

describe('the brainstorm tools', () => {
  const arrange = (state: FakeState['Service']) => {
    state.projects = [
      { name: 'app', path: '/work/app' },
      { name: 'notes', path: '/work/notes' },
    ];
    state.docs.set('app/AGENTS.md', '# App agents');
    state.issues.set('owner/app', [
      fakeIssue({ number: 3, title: 'Login' }),
      fakeIssue({ number: 4, title: 'A pull', pull: true }),
    ]);
  };

  const outputsOf = (state: FakeState['Service'], steps: ReadonlyArray<unknown>) =>
    Effect.gen(function* () {
      const tools = state.turns[0]?.tools ?? [];
      return yield* Effect.forEach(steps, (step) => {
        const { tool, input } = step as { tool: string; input: unknown };
        const found = tools.find((candidate) => candidate.name === tool);
        return found === undefined ? Effect.die(`No tool ${tool}`) : found.run(input);
      });
    });

  it.effect('read the projects, open issues and top-level docs, and nothing else', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          yield* brainstorm.send('Look around');
          yield* idle(brainstorm);

          const outcomes = yield* outputsOf(state, [
            { tool: 'list_projects', input: {} },
            { tool: 'list_open_issues', input: { project: 'app' } },
            { tool: 'read_project_doc', input: { project: 'app', file: 'AGENTS.md' } },
            { tool: 'read_project_doc', input: { project: 'app', file: '../secrets' } },
            { tool: 'read_project_doc', input: { project: 'app', file: 'README.md' } },
            { tool: 'list_open_issues', input: { project: 'notes' } },
            { tool: 'list_open_issues', input: { project: '../etc' } },
          ]);

          expect(outcomes.slice(0, 3)).toEqual([
            {
              output: [
                { name: 'app', onGitea: true },
                { name: 'notes', onGitea: false },
              ],
              isError: false,
              pause: false,
            },
            { output: [{ number: 3, title: 'Login' }], isError: false, pause: false },
            { output: '# App agents', isError: false, pause: false },
          ]);
          expect(outcomes.slice(3).map((outcome) => outcome.isError)).toEqual([
            true,
            true,
            true,
            true,
          ]);
        }),
      arrange,
    ),
  );

  it.effect('propose an issue as an open card and end the turn', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          state.script.push([
            { text: 'Let me file that.' },
            propose({ project: 'app', title: ' Dark mode ', body: 'A toggle.' }),
            { text: 'Never said.' },
          ]);

          yield* brainstorm.send('Dark mode for app');
          yield* idle(brainstorm);

          expect((yield* entries(brainstorm)).map(strip)).toEqual([
            { type: 'user', text: 'Dark mode for app' },
            { type: 'assistant', text: 'Let me file that.' },
            {
              type: 'proposal',
              project: 'app',
              title: 'Dark mode',
              body: 'A toggle.',
              state: { _tag: 'open' },
            },
          ]);
          expect(state.giteaCalls.filter((call) => call.startsWith('createIssue'))).toEqual([]);
        }),
      arrange,
    ),
  );

  it.effect('refuse a proposal for a project without Gitea or without a title', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          yield* brainstorm.send('Hi');
          yield* idle(brainstorm);
          const outcomes = yield* outputsOf(state, [
            propose({ project: 'notes', title: 'X', body: '' }),
            propose({ project: 'app', title: ' ', body: '' }),
          ]);
          expect(outcomes.map((outcome) => outcome.isError)).toEqual([true, true]);
          expect(proposalIn(yield* entries(brainstorm))).toBeUndefined();
        }),
      arrange,
    ),
  );
});

describe('a decision on a proposal', () => {
  // Pi proposes "Dark mode" for `app` in the first turn.
  const proposed = (brainstorm: Brainstorm, state: FakeState['Service']) =>
    Effect.gen(function* () {
      state.script.push([propose({ project: 'app', title: 'Dark mode', body: 'A toggle.' })]);
      yield* brainstorm.send('Dark mode');
      yield* idle(brainstorm);
      const proposal = proposalIn(yield* entries(brainstorm));
      if (proposal === undefined) throw new Error('Pi proposed nothing.');
      return proposal;
    });

  const created = (state: FakeState['Service']) =>
    state.giteaCalls.filter((call) => call.startsWith('createIssue'));

  it.effect('creates exactly the edited issue and tells Pi', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        const proposal = yield* proposed(brainstorm, state);

        yield* brainstorm.decide(proposal.id, {
          _tag: 'Create',
          draft: { project: 'app', title: ' Dark mode toggle ', body: 'Edited.' },
        });
        yield* idle(brainstorm);

        expect(created(state)).toEqual([
          'createIssue owner/app {"title":"Dark mode toggle","body":"Edited."}',
        ]);
        expect(proposalIn(yield* entries(brainstorm))).toMatchObject({
          title: 'Dark mode toggle',
          body: 'Edited.',
          state: { _tag: 'created', number: 1, url: 'http://gitea.test/owner/app/issues/1' },
        });
        expect(turnInputs(state)[1]).toBe(
          'The owner created the issue #1 in app: "Dark mode toggle" (http://gitea.test/owner/app/issues/1).',
        );
      }),
    ),
  );

  it.effect('discards without a Gitea request and tells Pi', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        const proposal = yield* proposed(brainstorm, state);

        yield* brainstorm.decide(proposal.id, { _tag: 'Discard' });
        yield* idle(brainstorm);

        expect(created(state)).toEqual([]);
        expect(proposalIn(yield* entries(brainstorm))?.state).toEqual({ _tag: 'discarded' });
        expect(turnInputs(state)[1]).toBe('The owner discarded the proposal "Dark mode" for app.');
      }),
    ),
  );

  it.effect('decides a proposal once, and only one that exists', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        const proposal = yield* proposed(brainstorm, state);
        yield* brainstorm.decide(proposal.id, { _tag: 'Discard' });
        yield* idle(brainstorm);

        expect(
          yield* brainstorm
            .decide(proposal.id, {
              _tag: 'Create',
              draft: { project: 'app', title: 'X', body: '' },
            })
            .pipe(Effect.flip),
        ).toEqual(new ProposalDecidedError({ id: proposal.id }));
        expect(yield* brainstorm.decide('nope', { _tag: 'Discard' }).pipe(Effect.flip)).toEqual(
          new ProposalNotFoundError({ id: 'nope' }),
        );
        expect(created(state)).toEqual([]);
      }),
    ),
  );

  it.effect('leaves a proposal open while the owner writes on', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        const proposal = yield* proposed(brainstorm, state);
        yield* brainstorm.send('One more thought');
        yield* idle(brainstorm);

        yield* brainstorm.decide(proposal.id, { _tag: 'Discard' });
        yield* idle(brainstorm);
        expect(proposalIn(yield* entries(brainstorm))?.state).toEqual({ _tag: 'discarded' });
      }),
    ),
  );

  it.effect('keeps the card open when the project has no Gitea remote or Gitea fails', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        const proposal = yield* proposed(brainstorm, state);
        state.projects = [...state.projects, { name: 'notes', path: '/work/notes' }];

        expect(
          yield* brainstorm
            .decide(proposal.id, {
              _tag: 'Create',
              draft: { project: 'notes', title: 'Dark mode', body: '' },
            })
            .pipe(Effect.flip),
        ).toEqual(new NoGiteaRemoteError({ project: 'notes' }));

        state.giteaFailure = 'Gitea answered 403.';
        expect(
          yield* brainstorm
            .decide(proposal.id, {
              _tag: 'Create',
              draft: { project: 'app', title: 'Dark mode', body: '' },
            })
            .pipe(Effect.flip),
        ).toEqual(new GiteaUnavailableError({ reason: 'Gitea answered 403.' }));

        expect(proposalIn(yield* entries(brainstorm))?.state).toEqual({ _tag: 'open' });
        expect(state.turns).toHaveLength(1);
      }),
    ),
  );

  it.effect('refuses a blank title before anything is created', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        const proposal = yield* proposed(brainstorm, state);
        const error = yield* brainstorm
          .decide(proposal.id, { _tag: 'Create', draft: { project: 'app', title: '', body: '' } })
          .pipe(Effect.flip);
        expect(error._tag).toBe('InvalidInputError');
        expect(created(state)).toEqual([]);
      }),
    ),
  );
});
