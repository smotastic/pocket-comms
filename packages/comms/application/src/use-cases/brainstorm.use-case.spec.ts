import { describe, expect, it } from '@effect/vitest';
import type { BrainstormEntry, Issue, ProposalEntry } from '@pocket-comms/comms-domain';
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
  IssueChangedError,
  IssueNotFoundError,
  NoGiteaRemoteError,
  ProposalDecidedError,
  ProposalNotFoundError,
} from '../errors.js';
import { MAX_ISSUE_BODY } from '@pocket-comms/comms-domain';
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
const readIssue = (project: string, number: number) => ({
  tool: 'read_issue',
  input: { project, number },
});
const proposeEdit = (input: { project: string; number: number; title: string; body: string }) => ({
  tool: 'propose_issue_edit',
  input,
});

describe('the brainstorm chat', () => {
  it.effect('adds the message, streams Pi’s answer and saves the chat', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ text: 'Nice idea. Which project?' }]);

        yield* brainstorm.send('  Idea: dark mode  ');
        yield* idle(brainstorm);

        expect((yield* entries(brainstorm)).map(strip)).toEqual([
          { type: 'user', text: 'Idea: dark mode', images: [] },
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
          'read_issue',
          'propose_issue',
          'propose_issue_edit',
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
          { type: 'user', text: 'One', images: [] },
          { type: 'assistant', text: 'First answer.' },
          { type: 'user', text: 'Two', images: [] },
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
          expect((yield* entries(brainstorm)).map(strip)).toEqual([
            { type: 'user', text: 'Kept', images: [] },
          ]);
          yield* brainstorm.send('Again');
          yield* idle(brainstorm);
          expect(state.turns[0]?.sessionId).toBe('chat-1');
          expect(state.turns[0]?.state).toEqual(Option.some({ adapter: 'scripted', state: 4 }));
        }),
      (state) => {
        state.storedChat = {
          id: 'chat-1',
          entries: [{ type: 'user', id: 'u1', at: 1, text: 'Kept', images: [] }],
          reads: [],
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
          seesPictures: true,
          pictures: [],
        });
        expect(state.storedChat?.entries).toEqual([]);
        expect(state.storedChat?.reads).toEqual([]);
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
      fakeIssue({ number: 3, title: 'Login', body: 'Users sign in.' }),
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
            { type: 'user', text: 'Dark mode for app', images: [] },
            { type: 'assistant', text: 'Let me file that.' },
            {
              type: 'proposal',
              kind: 'issue',
              project: 'app',
              title: 'Dark mode',
              body: 'A toggle.',
              pictures: [],
              attached: [],
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

  it.effect('read an issue, open or closed, and refuse a pull request or a missing issue', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          state.issues.set('owner/app', [
            ...(state.issues.get('owner/app') ?? []),
            fakeIssue({ number: 5, title: 'Old', body: 'Done.', state: 'closed' }),
          ]);
          yield* brainstorm.send('Look at issues');
          yield* idle(brainstorm);

          const outcomes = yield* outputsOf(state, [
            readIssue('app', 3),
            readIssue('app', 5),
            readIssue('app', 4),
            readIssue('app', 99),
            readIssue('notes', 1),
          ]);

          expect(outcomes.slice(0, 2)).toEqual([
            {
              output: {
                number: 3,
                title: 'Login',
                body: 'Users sign in.',
                state: 'open',
                url: 'http://gitea.test/owner/app/issues/3',
              },
              isError: false,
              pause: false,
            },
            {
              output: {
                number: 5,
                title: 'Old',
                body: 'Done.',
                state: 'closed',
                url: 'http://gitea.test/owner/app/issues/5',
              },
              isError: false,
              pause: false,
            },
          ]);
          expect(outcomes.slice(2).map((outcome) => outcome.isError)).toEqual([true, true, true]);
          expect(state.storedChat?.reads.map((read) => read.number)).toEqual([3, 5]);
        }),
      arrange,
    ),
  );

  it.effect('cut a long issue body and say that it cannot be edited', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          state.issues.set('owner/app', [
            fakeIssue({ number: 7, title: 'Long', body: 'x'.repeat(MAX_ISSUE_BODY + 5) }),
          ]);
          yield* brainstorm.send('Read it');
          yield* idle(brainstorm);

          const [read, edit] = yield* outputsOf(state, [
            readIssue('app', 7),
            proposeEdit({ project: 'app', number: 7, title: 'Long', body: 'Short' }),
          ]);
          expect(read?.isError).toBe(false);
          expect(read?.output).toMatchObject({
            body: 'x'.repeat(MAX_ISSUE_BODY),
            note: expect.stringContaining('cut'),
          });
          expect(edit?.isError).toBe(true);
          expect(proposalIn(yield* entries(brainstorm))).toBeUndefined();
        }),
      arrange,
    ),
  );

  it.effect('propose an edit only for an issue read in this chat, with what was read as base', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          state.script.push([
            readIssue('app', 3),
            proposeEdit({ project: 'app', number: 3, title: ' Login v2 ', body: 'New body.' }),
            { text: 'Never said.' },
          ]);
          yield* brainstorm.send('Update login');
          yield* idle(brainstorm);

          expect(proposalIn(yield* entries(brainstorm))).toMatchObject({
            type: 'proposal',
            kind: 'edit',
            project: 'app',
            number: 3,
            url: 'http://gitea.test/owner/app/issues/3',
            title: 'Login v2',
            body: 'New body.',
            base: { title: 'Login', body: 'Users sign in.' },
            state: { _tag: 'open' },
          });
          expect(state.giteaCalls.filter((call) => call.startsWith('updateIssue'))).toEqual([]);

          const [unread, blank] = yield* outputsOf(state, [
            proposeEdit({ project: 'app', number: 5, title: 'X', body: '' }),
            proposeEdit({ project: 'app', number: 3, title: ' ', body: '' }),
          ]);
          expect([unread?.isError, blank?.isError]).toEqual([true, true]);
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

describe('a decision on an edit', () => {
  const arrange = (state: FakeState['Service']) => {
    state.issues.set('owner/app', [
      fakeIssue({ number: 11, title: 'Orchestrator', body: '## Idea\n\nRun agents.' }),
    ]);
  };

  // Pi reads #11 of `app` and proposes a new body in the first turn.
  const proposed = (brainstorm: Brainstorm, state: FakeState['Service']) =>
    Effect.gen(function* () {
      state.script.push([
        readIssue('app', 11),
        proposeEdit({
          project: 'app',
          number: 11,
          title: 'Orchestrator',
          body: '## Idea\n\nRun agents from the chat.',
        }),
      ]);
      yield* brainstorm.send('Update #11');
      yield* idle(brainstorm);
      const proposal = proposalIn(yield* entries(brainstorm));
      if (proposal === undefined) throw new Error('Pi proposed nothing.');
      return proposal;
    });

  const updates = (state: FakeState['Service']) =>
    state.giteaCalls.filter((call) => call.startsWith('updateIssue'));

  const changeIssue = (state: FakeState['Service'], change: Partial<Issue>) => {
    const issues = state.issues.get('owner/app') ?? [];
    state.issues.set(
      'owner/app',
      issues.map((issue) => (issue.number === 11 ? { ...issue, ...change } : issue)),
    );
  };

  it.effect('applies exactly the shown title and body and tells Pi', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);

          yield* brainstorm.decide(proposal.id, {
            _tag: 'Apply',
            title: ' Orchestrator mode ',
            body: 'Edited.',
          });
          yield* idle(brainstorm);

          expect(updates(state)).toEqual([
            'updateIssue owner/app 11 {"title":"Orchestrator mode","body":"Edited."}',
          ]);
          expect(proposalIn(yield* entries(brainstorm))).toMatchObject({
            title: 'Orchestrator mode',
            body: 'Edited.',
            state: { _tag: 'updated', url: 'http://gitea.test/owner/app/issues/11' },
          });
          expect(turnInputs(state)[1]).toContain('The owner updated the issue #11 in app');
          expect(state.storedChat?.reads).toEqual([
            {
              project: 'app',
              number: 11,
              url: 'http://gitea.test/owner/app/issues/11',
              title: 'Orchestrator mode',
              body: 'Edited.',
              cut: false,
            },
          ]);
        }),
      arrange,
    ),
  );

  it.effect('refuses to apply when the title or body changed since Pi read the issue', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          changeIssue(state, { body: 'Someone else wrote this.' });

          expect(
            yield* brainstorm
              .decide(proposal.id, { _tag: 'Apply', title: 'Orchestrator', body: 'Mine.' })
              .pipe(Effect.flip),
          ).toEqual(new IssueChangedError({ number: 11 }));
          expect(updates(state)).toEqual([]);
          expect(proposalIn(yield* entries(brainstorm))?.state).toEqual({ _tag: 'open' });
          expect(state.turns).toHaveLength(1);
        }),
      arrange,
    ),
  );

  it.effect('applies when only comments or labels changed the issue', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          changeIssue(state, { updatedAt: 99, labels: ['status/in-progress'] });

          yield* brainstorm.decide(proposal.id, {
            _tag: 'Apply',
            title: 'Orchestrator',
            body: 'Mine.',
          });
          yield* idle(brainstorm);
          expect(updates(state)).toHaveLength(1);
        }),
      arrange,
    ),
  );

  it.effect('discards without a Gitea write and tells Pi', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          const calls = state.giteaCalls.length;

          yield* brainstorm.decide(proposal.id, { _tag: 'Discard' });
          yield* idle(brainstorm);

          expect(state.giteaCalls).toHaveLength(calls);
          expect(proposalIn(yield* entries(brainstorm))?.state).toEqual({ _tag: 'discarded' });
          expect(turnInputs(state)[1]).toBe(
            'The owner discarded your edit of the issue #11 in app.',
          );
        }),
      arrange,
    ),
  );

  it.effect('refuses a decision that does not fit the proposal', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          const error = yield* brainstorm
            .decide(proposal.id, {
              _tag: 'Create',
              draft: { project: 'app', title: 'X', body: '' },
            })
            .pipe(Effect.flip);
          expect(error._tag).toBe('InvalidInputError');

          state.script.push([propose({ project: 'app', title: 'New', body: '' })]);
          yield* brainstorm.send('And a new one');
          yield* idle(brainstorm);
          const issue = (yield* entries(brainstorm)).find(
            (entry): entry is ProposalEntry => entry.type === 'proposal' && entry.kind === 'issue',
          );
          const wrong = yield* brainstorm
            .decide(issue?.id ?? '', { _tag: 'Apply', title: 'X', body: '' })
            .pipe(Effect.flip);
          expect(wrong._tag).toBe('InvalidInputError');
          expect(state.giteaCalls.filter((call) => !call.startsWith('issue '))).toEqual([]);
        }),
      arrange,
    ),
  );

  it.effect('keeps the card open when the issue is gone or Gitea fails', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          const apply = { _tag: 'Apply', title: 'Orchestrator', body: 'Mine.' } as const;

          state.giteaFailure = 'Gitea answered 403.';
          expect(yield* brainstorm.decide(proposal.id, apply).pipe(Effect.flip)).toEqual(
            new GiteaUnavailableError({ reason: 'Gitea answered 403.' }),
          );
          state.giteaFailure = undefined;

          state.issues.set('owner/app', []);
          expect(yield* brainstorm.decide(proposal.id, apply).pipe(Effect.flip)).toEqual(
            new IssueNotFoundError({ number: 11 }),
          );

          expect(updates(state)).toEqual([]);
          expect(proposalIn(yield* entries(brainstorm))?.state).toEqual({ _tag: 'open' });
        }),
      arrange,
    ),
  );

  it.effect('decides an edit once', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          yield* brainstorm.decide(proposal.id, { _tag: 'Discard' });
          yield* idle(brainstorm);

          expect(
            yield* brainstorm
              .decide(proposal.id, { _tag: 'Apply', title: 'Orchestrator', body: 'Mine.' })
              .pipe(Effect.flip),
          ).toEqual(new ProposalDecidedError({ id: proposal.id }));
          expect(updates(state)).toEqual([]);
        }),
      arrange,
    ),
  );

  it.effect('forgets the reads on New chat, also a read that ends after it', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          yield* proposed(brainstorm, state);
          yield* brainstorm.reset();
          expect(state.storedChat?.reads).toEqual([]);

          // Pi's tools run outside the turn and may finish after it was stopped.
          const read = state.turns[0]?.tools.find((tool) => tool.name === 'read_issue');
          yield* read?.run({ project: 'app', number: 11 }) ?? Effect.void;
          expect(state.storedChat?.reads).toEqual([]);

          state.script.push([
            proposeEdit({ project: 'app', number: 11, title: 'Orchestrator', body: 'Late.' }),
          ]);
          yield* brainstorm.send('Edit #11');
          yield* idle(brainstorm);
          expect(proposalIn(yield* entries(brainstorm))).toBeUndefined();
        }),
      arrange,
    ),
  );
});

describe('pictures in the brainstorm chat', () => {
  const PICTURE_A = `image${'a'.repeat(20)}a`;
  const PICTURE_B = `image${'a'.repeat(20)}b`;
  const PICTURE_C = `image${'a'.repeat(20)}c`;

  // Three uploaded pictures and an issue #11 of `app` that Pi can read.
  const arrange = (state: FakeState['Service']) => {
    for (const [index, id] of [PICTURE_A, PICTURE_B, PICTURE_C].entries()) {
      state.images.set(id, {
        kind: index === 0 ? 'png' : 'jpeg',
        bytes: new Uint8Array([index]),
        savedAt: 0,
      });
    }
    state.issues.set('owner/app', [
      fakeIssue({ number: 11, title: 'Orchestrator', body: 'Run agents.' }),
    ]);
  };

  const withPictures = (input: Record<string, string>, pictures: ReadonlyArray<number>) => ({
    tool: 'propose_issue',
    input: { ...input, pictures },
  });

  /** Pi gets two pictures and proposes an issue with picture 2. */
  const proposed = (brainstorm: Brainstorm, state: FakeState['Service']) =>
    Effect.gen(function* () {
      state.script.push([
        withPictures({ project: 'app', title: 'Blue door', body: 'Paint it.' }, [2]),
      ]);
      yield* brainstorm.send('Like these?', [PICTURE_A, PICTURE_B]);
      yield* idle(brainstorm);
      const proposal = proposalIn(yield* entries(brainstorm));
      if (proposal === undefined) throw new Error('Pi proposed nothing.');
      return proposal;
    });

  const gitea = (state: FakeState['Service']) =>
    state.giteaCalls.filter((call) => !call.startsWith('openIssues'));

  it.effect('sends the pictures to a model that sees them, numbered across the chat', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          yield* brainstorm.send('Like this?', [PICTURE_A]);
          yield* idle(brainstorm);
          yield* brainstorm.send('', [PICTURE_B, PICTURE_C]);
          yield* idle(brainstorm);

          const shown = yield* brainstorm.state;
          expect(
            ready(shown)
              .entries.filter((entry) => entry.type === 'user')
              .map(strip),
          ).toEqual([
            { type: 'user', text: 'Like this?', images: [PICTURE_A] },
            { type: 'user', text: '', images: [PICTURE_B, PICTURE_C] },
          ]);
          expect(ready(shown)).toMatchObject({
            seesPictures: true,
            pictures: [
              { id: PICTURE_A, number: 1, available: true },
              { id: PICTURE_B, number: 2, available: true },
              { id: PICTURE_C, number: 3, available: true },
            ],
          });
          expect(turnInputs(state)).toEqual([
            'Like this?\n\n[Picture 1 attached]',
            '[Pictures 2, 3 attached]',
          ]);
          expect(state.turns[0]?.images).toEqual([{ kind: 'png', bytes: new Uint8Array([0]) }]);
          expect(state.turns[1]?.images).toHaveLength(2);
        }),
      arrange,
    ),
  );

  it.effect('tells Pi it cannot see the pictures when the model takes none', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          yield* brainstorm.send('Like this?', [PICTURE_A]);
          yield* idle(brainstorm);

          expect(turnInputs(state)).toEqual([
            'Like this?\n\n[Picture 1 attached; you cannot see pictures]',
          ]);
          expect(state.turns[0]?.images).toEqual([]);
          expect(ready(yield* brainstorm.state).seesPictures).toBe(false);
        }),
      (state) => {
        arrange(state);
        state.seesImages = false;
      },
    ),
  );

  it.effect(
    'refuses a message with an unknown picture or more than five, and changes nothing',
    () =>
      run(
        (brainstorm, state) =>
          Effect.gen(function* () {
            const unknown = yield* Effect.flip(brainstorm.send('Hi', [`image${'z'.repeat(21)}`]));
            const many = yield* Effect.flip(brainstorm.send('Hi', Array(6).fill(PICTURE_A)));

            expect(unknown._tag).toBe('InvalidInputError');
            expect(many._tag).toBe('InvalidInputError');
            expect(yield* entries(brainstorm)).toEqual([]);
            expect(state.turns).toEqual([]);
          }),
        arrange,
      ),
  );

  it.effect('shows a removed picture as not available', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          yield* brainstorm.send('Look', [PICTURE_A]);
          yield* idle(brainstorm);
          state.images.delete(PICTURE_A);

          expect(ready(yield* brainstorm.state).pictures).toEqual([
            { id: PICTURE_A, number: 1, available: false },
          ]);
        }),
      arrange,
    ),
  );

  it.effect('keeps the pictures Pi names on its proposal, and refuses a wrong number', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          expect(proposal).toMatchObject({ pictures: [PICTURE_B], attached: [] });

          state.script.push([
            withPictures({ project: 'app', title: 'Other', body: 'x' }, [7]),
            { text: 'Sorry.' },
          ]);
          yield* brainstorm.send('Another');
          yield* idle(brainstorm);
          expect(
            (yield* entries(brainstorm)).filter((entry) => entry.type === 'proposal'),
          ).toHaveLength(1);
        }),
      arrange,
    ),
  );

  it.effect('creates the issue, attaches the chosen pictures and appends them to its body', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);

          yield* brainstorm.decide(proposal.id, {
            _tag: 'Create',
            draft: { project: 'app', title: 'Blue door', body: 'Paint it.' },
            pictures: [PICTURE_B, PICTURE_A],
          });
          yield* idle(brainstorm);

          expect(gitea(state)).toEqual([
            'createIssue owner/app {"title":"Blue door","body":"Paint it."}',
            'attachImage owner/app 12 picture-1.png',
            'attachImage owner/app 12 picture-2.jpg',
            'issue owner/app 12',
            `updateIssue owner/app 12 ${JSON.stringify({
              title: 'Blue door',
              body: 'Paint it.\n\n## Pictures\n\n![Picture 1](http://gitea.test/attachments/12/picture-1.png)\n![Picture 2](http://gitea.test/attachments/12/picture-2.jpg)',
            })}`,
          ]);
          expect(proposalIn(yield* entries(brainstorm))).toMatchObject({
            pictures: [PICTURE_A, PICTURE_B],
            attached: [
              { image: PICTURE_A, url: 'http://gitea.test/attachments/12/picture-1.png' },
              { image: PICTURE_B, url: 'http://gitea.test/attachments/12/picture-2.jpg' },
            ],
            state: { _tag: 'created', number: 12 },
          });
          expect(turnInputs(state)[1]).toBe(
            'The owner created the issue #12 in app: "Blue door" (http://gitea.test/owner/app/issues/12), with pictures 1, 2.',
          );
        }),
      arrange,
    ),
  );

  it.effect('creates the issue with one request when no picture is chosen', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);

          yield* brainstorm.decide(proposal.id, {
            _tag: 'Create',
            draft: { project: 'app', title: 'Blue door', body: 'Paint it.' },
            pictures: [],
          });

          expect(gitea(state)).toEqual([
            'createIssue owner/app {"title":"Blue door","body":"Paint it."}',
          ]);
        }),
      arrange,
    ),
  );

  it.effect(
    'keeps a created issue and the attached pictures when an upload fails, and retries',
    () =>
      run(
        (brainstorm, state) =>
          Effect.gen(function* () {
            const proposal = yield* proposed(brainstorm, state);
            state.giteaRefusedPictures.add('picture-2.jpg');
            const create = {
              _tag: 'Create',
              draft: { project: 'app', title: 'Blue door', body: 'Paint it.' },
              pictures: [PICTURE_A, PICTURE_B],
            } as const;

            const failed = yield* Effect.flip(brainstorm.decide(proposal.id, create));
            expect(failed).toEqual(
              new GiteaUnavailableError({ reason: 'Gitea refused picture-2.jpg (422).' }),
            );
            expect(proposalIn(yield* entries(brainstorm))).toMatchObject({
              state: {
                _tag: 'attaching',
                number: 12,
                url: 'http://gitea.test/owner/app/issues/12',
              },
              attached: [{ image: PICTURE_A }],
            });
            expect(state.turns).toHaveLength(1);
            expect(
              state.storedChat?.entries.find((entry) => entry.type === 'proposal'),
            ).toMatchObject({ state: { _tag: 'attaching' } });

            state.giteaRefusedPictures.clear();
            state.giteaCalls.length = 0;
            yield* brainstorm.decide(proposal.id, create);
            yield* idle(brainstorm);

            expect(gitea(state)).toEqual([
              'attachImage owner/app 12 picture-2.jpg',
              'issue owner/app 12',
              expect.stringContaining('updateIssue owner/app 12'),
            ]);
            expect(proposalIn(yield* entries(brainstorm))?.state).toMatchObject({
              _tag: 'created',
            });
          }),
        arrange,
      ),
  );

  it.effect('finishes without the pictures that are not attached and tells Pi', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          state.giteaRefusedPictures.add('picture-2.jpg');
          yield* Effect.flip(
            brainstorm.decide(proposal.id, {
              _tag: 'Create',
              draft: { project: 'app', title: 'Blue door', body: 'Paint it.' },
              pictures: [PICTURE_A, PICTURE_B],
            }),
          );
          state.giteaCalls.length = 0;

          yield* brainstorm.decide(proposal.id, { _tag: 'FinishWithout' });
          yield* idle(brainstorm);

          expect(gitea(state)).toEqual([
            'issue owner/app 12',
            `updateIssue owner/app 12 ${JSON.stringify({
              title: 'Blue door',
              body: 'Paint it.\n\n## Pictures\n\n![Picture 1](http://gitea.test/attachments/12/picture-1.png)',
            })}`,
          ]);
          expect(proposalIn(yield* entries(brainstorm))?.state).toMatchObject({ _tag: 'created' });
          expect(turnInputs(state)[1]).toContain('with pictures 1; picture 2 was left out');
        }),
      arrange,
    ),
  );

  it.effect('refuses a Finish without on an open proposal and a Discard on an attaching one', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          const early = yield* Effect.flip(
            brainstorm.decide(proposal.id, { _tag: 'FinishWithout' }),
          );
          expect(early._tag).toBe('InvalidInputError');

          state.giteaRefusedPictures.add('picture-2.jpg');
          yield* Effect.flip(
            brainstorm.decide(proposal.id, {
              _tag: 'Create',
              draft: { project: 'app', title: 'Blue door', body: 'Paint it.' },
              pictures: [PICTURE_B],
            }),
          );
          const discard = yield* Effect.flip(brainstorm.decide(proposal.id, { _tag: 'Discard' }));
          expect(discard._tag).toBe('InvalidInputError');
        }),
      arrange,
    ),
  );

  it.effect('refuses a removed or unknown picture before any Gitea request', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          state.images.delete(PICTURE_B);
          const draft = { project: 'app', title: 'Blue door', body: 'Paint it.' };

          const removed = yield* Effect.flip(
            brainstorm.decide(proposal.id, { _tag: 'Create', draft, pictures: [PICTURE_B] }),
          );
          const unknown = yield* Effect.flip(
            brainstorm.decide(proposal.id, { _tag: 'Create', draft, pictures: [PICTURE_C] }),
          );

          expect(removed._tag).toBe('InvalidInputError');
          expect(unknown._tag).toBe('InvalidInputError');
          expect(gitea(state)).toEqual([]);
          expect(proposalIn(yield* entries(brainstorm))?.state).toEqual({ _tag: 'open' });
        }),
      arrange,
    ),
  );

  it.effect('discards without a Gitea request', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          yield* brainstorm.decide(proposal.id, { _tag: 'Discard' });
          expect(gitea(state)).toEqual([]);
        }),
      arrange,
    ),
  );

  describe('on an edit', () => {
    const edited = (brainstorm: Brainstorm, state: FakeState['Service']) =>
      Effect.gen(function* () {
        state.script.push([
          readIssue('app', 11),
          {
            tool: 'propose_issue_edit',
            input: {
              project: 'app',
              number: 11,
              title: 'Orchestrator',
              body: 'Run agents.',
              pictures: [1],
            },
          },
        ]);
        yield* brainstorm.send('Add this to #11', [PICTURE_A]);
        yield* idle(brainstorm);
        const proposal = proposalIn(yield* entries(brainstorm));
        if (proposal === undefined) throw new Error('Pi proposed nothing.');
        state.giteaCalls.length = 0;
        return proposal;
      });

    it.effect('checks the base, attaches the pictures and appends them to the shown body', () =>
      run(
        (brainstorm, state) =>
          Effect.gen(function* () {
            const proposal = yield* edited(brainstorm, state);
            expect(proposal).toMatchObject({ pictures: [PICTURE_A] });

            yield* brainstorm.decide(proposal.id, {
              _tag: 'Apply',
              title: 'Orchestrator',
              body: 'Run agents from the chat.',
              pictures: [PICTURE_A],
            });
            yield* idle(brainstorm);

            expect(gitea(state)).toEqual([
              'issue owner/app 11',
              'attachImage owner/app 11 picture-1.png',
              `updateIssue owner/app 11 ${JSON.stringify({
                title: 'Orchestrator',
                body: 'Run agents from the chat.\n\n## Pictures\n\n![Picture 1](http://gitea.test/attachments/11/picture-1.png)',
              })}`,
            ]);
            expect(proposalIn(yield* entries(brainstorm))?.state).toMatchObject({
              _tag: 'updated',
            });
            expect(turnInputs(state)[1]).toContain('with pictures 1');
          }),
        arrange,
      ),
    );

    it.effect('uploads nothing when the issue changed since Pi read it', () =>
      run(
        (brainstorm, state) =>
          Effect.gen(function* () {
            const proposal = yield* edited(brainstorm, state);
            state.issues.set('owner/app', [
              fakeIssue({ number: 11, title: 'Orchestrator', body: 'Changed.' }),
            ]);

            const failed = yield* Effect.flip(
              brainstorm.decide(proposal.id, {
                _tag: 'Apply',
                title: 'Orchestrator',
                body: 'x',
                pictures: [PICTURE_A],
              }),
            );

            expect(failed).toEqual(new IssueChangedError({ number: 11 }));
            expect(gitea(state)).toEqual(['issue owner/app 11']);
          }),
        arrange,
      ),
    );

    it.effect('changes no body when an upload fails, and uploads only the others again', () =>
      run(
        (brainstorm, state) =>
          Effect.gen(function* () {
            const proposal = yield* edited(brainstorm, state);
            yield* brainstorm.send('And this', [PICTURE_B]);
            yield* idle(brainstorm);
            state.giteaRefusedPictures.add('picture-2.jpg');
            state.giteaCalls.length = 0;
            const apply = {
              _tag: 'Apply',
              title: 'Orchestrator',
              body: 'Run agents.',
              pictures: [PICTURE_A, PICTURE_B],
            } as const;

            yield* Effect.flip(brainstorm.decide(proposal.id, apply));
            expect(gitea(state).filter((call) => call.startsWith('updateIssue'))).toEqual([]);
            expect(proposalIn(yield* entries(brainstorm))).toMatchObject({
              state: { _tag: 'open' },
              attached: [{ image: PICTURE_A }],
            });

            state.giteaRefusedPictures.clear();
            state.giteaCalls.length = 0;
            yield* brainstorm.decide(proposal.id, apply);

            expect(gitea(state).filter((call) => call.startsWith('attachImage'))).toEqual([
              'attachImage owner/app 11 picture-2.jpg',
            ]);
          }),
        arrange,
      ),
    );
  });
});
