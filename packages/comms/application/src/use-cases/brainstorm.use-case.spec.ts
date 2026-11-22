import { describe, expect, it } from '@effect/vitest';
import type { BrainstormEntry, Issue, ProposalEntry } from '@pocket-comms/comms-domain';
import { emptyChat, foldChat, type ChatView } from '@smotastic/pocket-agent/chat';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Queue from 'effect/Queue';
import * as Result from 'effect/Result';
import * as Stream from 'effect/Stream';
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
import { collect, settle } from '../testing/streams.js';
import { BRAINSTORM_INSTRUCTIONS, makeBrainstorm } from './brainstorm.use-case.js';

type Brainstorm = Effect.Success<typeof makeBrainstorm>;

const ready = (state: BrainstormStateDto) => {
  if (state._tag !== 'Ready') throw new Error(`The brainstorm is ${state._tag}.`);
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

/** What a sheet that follows the brainstorm from its start holds once the stream is quiet. */
const follow = (brainstorm: Brainstorm, after = 0) =>
  Effect.gen(function* () {
    const events = yield* collect(brainstorm.events(after));
    yield* settle;
    let view: ChatView<BrainstormEntry> = emptyChat;
    for (const event of yield* Queue.clear(events)) view = foldChat(view, event);
    return view;
  });

type Shown =
  | Extract<BrainstormEntry, { readonly kind: 'said' }>
  | { readonly kind: 'agentMessage'; readonly text: string }
  | { readonly kind: 'turnFailed'; readonly reason: string }
  | ProposalEntry;

/**
 * The brainstorm as the sheet shows it, without the tools: the owner's messages, Pi's replies and
 * failures, and each proposal as its latest record in the place of its first.
 */
const entries = (brainstorm: Brainstorm) =>
  Effect.map(follow(brainstorm), (view) => {
    let shown: Array<Shown> = [];
    for (const item of view.items) {
      if (item.kind === 'agentMessage') shown.push({ kind: 'agentMessage', text: item.text });
      if (item.kind === 'turnFailed') shown.push({ kind: 'turnFailed', reason: item.reason });
      if (item.kind !== 'app') continue;
      const entry = item.entry;
      if (entry.kind === 'brainstormStarted') shown = [];
      if (entry.kind === 'said') shown.push(entry);
      if (entry.kind === 'proposal') {
        const at = shown.findIndex((one) => 'type' in one && one.id === entry.proposal.id);
        if (at === -1) shown.push(entry.proposal);
        else shown[at] = entry.proposal;
      }
    }
    return shown;
  });

/** The tool rows of the brainstorm: each tool's name, its summary and its state. */
const tools = (brainstorm: Brainstorm) =>
  Effect.map(follow(brainstorm), (view) =>
    view.items.flatMap((item) =>
      item.kind === 'tool'
        ? [{ tool: item.tool, target: item.target, detail: item.detail, state: item.state }]
        : [],
    ),
  );

const strip = (entry: Shown) => {
  if (entry.kind !== 'said' && !('type' in entry)) return entry;
  const { id: _id, at: _at, ...rest } = entry;
  return rest;
};

const proposalIn = (all: ReadonlyArray<Shown>) =>
  all.find((entry): entry is ProposalEntry => 'type' in entry);

const turnInputs = (state: FakeState['Service']) => state.turns.map((turn) => turn.input);

// Runs a test with a fresh brainstorm built after `arrange`, in a scope that ends its turns.
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

describe('the brainstorm', () => {
  it.effect('adds the message, streams Pi’s answer and saves the brainstorm', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ text: 'Nice idea. Which project?' }]);

        yield* brainstorm.send('  Idea: dark mode  ');
        yield* idle(brainstorm);

        expect((yield* entries(brainstorm)).map(strip)).toEqual([
          { kind: 'said', text: 'Idea: dark mode', images: [] },
          { kind: 'agentMessage', text: 'Nice idea. Which project?' },
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
        expect(
          state.storedBrainstorm?.log.map((stored) => [stored.sequence, stored.entry.kind]),
        ).toEqual([
          [1, 'said'],
          [2, 'agentMessage'],
          [3, 'turnEnded'],
        ]);
        expect(state.storedBrainstorm?.runtime).toEqual(
          Option.some({ adapter: 'scripted', state: 1 }),
        );
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
        expect((yield* entries(brainstorm)).map((entry) => entry.kind)).toEqual([
          'said',
          'agentMessage',
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
          { kind: 'said', text: 'One', images: [] },
          { kind: 'agentMessage', text: 'First answer.' },
          { kind: 'said', text: 'Two', images: [] },
          { kind: 'turnFailed', reason: 'The model cannot be reached.' },
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

  it.effect('starts with the stored brainstorm after a restart', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          expect((yield* entries(brainstorm)).map(strip)).toEqual([
            { kind: 'said', text: 'Kept', images: [] },
          ]);
          yield* brainstorm.send('Again');
          yield* idle(brainstorm);
          expect(state.turns[0]?.sessionId).toBe('chat-1');
          expect(state.turns[0]?.state).toEqual(Option.some({ adapter: 'scripted', state: 4 }));
        }),
      (state) => {
        state.storedBrainstorm = {
          id: 'chat-1',
          log: [
            { sequence: 1, entry: { kind: 'said', id: 'u1', at: 1, text: 'Kept', images: [] } },
          ],
          reads: [],
          runtime: Option.some({ adapter: 'scripted', state: 4 }),
        };
      },
    ),
  );

  it.effect('starts an empty brainstorm on reset and stops a running answer', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ until: Effect.never }]);
        yield* brainstorm.send('Hold on');
        yield* Effect.yieldNow;

        yield* brainstorm.reset();

        expect(yield* brainstorm.state).toEqual({
          _tag: 'Ready',
          answering: false,
          seesImages: true,
          images: [],
          voice: true,
        });
        expect(yield* entries(brainstorm)).toEqual([]);
        // The new brainstorm goes on from the stopped turn's numbers, so a sheet that follows sees it.
        expect(state.storedBrainstorm?.log).toEqual([
          { sequence: 3, entry: { kind: 'brainstormStarted' } },
        ]);
        expect(state.storedBrainstorm?.reads).toEqual([]);
        expect(state.storedBrainstorm?.runtime).toEqual(Option.none());
      }),
    ),
  );

  it.effect('keeps a late write of a stopped turn out of the new brainstorm', () =>
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
          kind: 'turnFailed',
          reason: 'The agent did not answer in time.',
        });
      }),
    ),
  );

  it.effect('shows a turn that failed in an unexpected way', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ until: Effect.die('boom') }]);
        yield* brainstorm.send('Hi');
        yield* idle(brainstorm);

        expect((yield* entries(brainstorm)).map(strip).at(-1)).toEqual({
          kind: 'turnFailed',
          reason: 'The turn failed unexpectedly.',
        });
      }),
    ),
  );

  it.effect('shows a turn whose end could not be saved, and takes the next message', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ text: 'Hello.' }]);
        state.saveDies = (stored) => Option.isSome(stored.runtime);
        yield* brainstorm.send('Hi');
        yield* idle(brainstorm);

        expect((yield* entries(brainstorm)).map(strip).at(-1)).toEqual({
          kind: 'turnFailed',
          reason: 'The brainstorm could not be saved after this answer.',
        });
        state.saveDies = undefined;
        yield* brainstorm.send('Again');
        yield* idle(brainstorm);
      }),
    ),
  );

  it.effect('streams the text Pi writes and then its whole reply once', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ text: 'Hello' }]);
        const events = yield* collect(brainstorm.events(0));
        yield* settle;

        yield* brainstorm.send('Hi');
        yield* idle(brainstorm);
        yield* settle;

        expect(yield* Queue.clear(events)).toEqual([
          { kind: 'entry', sequence: 1, entry: expect.objectContaining({ kind: 'said' }) },
          { kind: 'delta', text: 'Hello' },
          { kind: 'entry', sequence: 2, entry: { kind: 'agentMessage', text: 'Hello' } },
          { kind: 'entry', sequence: 3, entry: { kind: 'turnEnded' } },
        ]);
      }),
    ),
  );

  it.effect('gives a sheet that follows again only the entries after its number', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.script.push([{ text: 'Hello' }]);
        yield* brainstorm.send('Hi');
        yield* idle(brainstorm);

        const view = yield* follow(brainstorm, 1);
        expect(view.items.map((item) => [item.sequence, item.kind])).toEqual([[2, 'agentMessage']]);
        expect(view).toMatchObject({ after: 3, draft: '', working: false });
      }),
    ),
  );

  it.effect('shows each tool Pi runs as a summary that settles', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          state.script.push([
            { tool: 'list_projects', input: {} },
            readIssue('app', 3),
            { tool: 'read_project_doc', input: { project: 'app', file: 'README.md' } },
            { text: 'Read it.' },
          ]);
          yield* brainstorm.send('What is in app?');
          yield* idle(brainstorm);

          expect(yield* tools(brainstorm)).toEqual([
            { tool: 'list_projects', target: undefined, detail: undefined, state: 'done' },
            { tool: 'read_issue', target: 'app #3', detail: undefined, state: 'failed' },
            { tool: 'read_project_doc', target: 'app/README.md', detail: undefined, state: 'done' },
          ]);
        }),
      (state) => {
        state.projects = [{ name: 'app', path: '/work/app' }];
        state.docs.set('app/README.md', '# App');
      },
    ),
  );

  it.effect('settles a running tool as stopped when the owner starts a new brainstorm', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        state.readDocWait = Effect.never;
        state.script.push([
          { tool: 'read_project_doc', input: { project: 'app', file: 'README.md' } },
        ]);
        yield* brainstorm.send('Hold on');
        yield* settle;

        const before = yield* follow(brainstorm);
        const events = yield* collect(brainstorm.events(before.after));
        yield* settle;
        yield* brainstorm.reset();
        yield* settle;
        let view = before;
        for (const event of yield* Queue.clear(events)) view = foldChat(view, event);
        expect(before.items.find((item) => item.kind === 'tool')).toMatchObject({
          state: 'running',
        });
        expect(view.items.find((item) => item.kind === 'tool')).toMatchObject({ state: 'stopped' });
        expect(view.items.at(-1)).toEqual({
          kind: 'app',
          sequence: view.after,
          entry: { kind: 'brainstormStarted' },
        });
        expect(view.working).toBe(false);
      }),
    ),
  );

  it.effect('is answering when the message arrives on the stream and idle at the turn’s end', () =>
    run((brainstorm, state) =>
      Effect.gen(function* () {
        const hold = yield* Deferred.make<void>();
        state.script.push([{ until: Deferred.await(hold) }, { text: 'Hello' }]);
        const seen = yield* collect(
          brainstorm.events(0).pipe(
            Stream.filterMap((event) =>
              event.kind === 'entry' &&
              (event.entry.kind === 'said' || event.entry.kind === 'turnEnded')
                ? Result.succeed(event.entry.kind)
                : Result.failVoid,
            ),
            Stream.mapEffect((kind) =>
              Effect.map(brainstorm.state, (now) => [kind, ready(now).answering]),
            ),
          ),
        );
        yield* brainstorm.send('Hi');
        yield* settle;
        expect(yield* Queue.clear(seen)).toEqual([['said', true]]);

        yield* Deferred.succeed(hold, undefined);
        yield* idle(brainstorm);
        yield* settle;
        expect(yield* Queue.clear(seen)).toEqual([['turnEnded', false]]);
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
            { kind: 'said', text: 'Dark mode for app', images: [] },
            { kind: 'agentMessage', text: 'Let me file that.' },
            {
              type: 'proposal',
              kind: 'issue',
              project: 'app',
              title: 'Dark mode',
              body: 'A toggle.',
              images: [],
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
          expect(state.storedBrainstorm?.reads.map((read) => read.number)).toEqual([3, 5]);
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

  it.effect(
    'propose an edit only for an issue read in this brainstorm, with what was read as base',
    () =>
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
          issue: { project: 'app', title: ' Dark mode toggle ', body: 'Edited.' },
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
              issue: { project: 'app', title: 'X', body: '' },
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
              issue: { project: 'notes', title: 'Dark mode', body: '' },
            })
            .pipe(Effect.flip),
        ).toEqual(new NoGiteaRemoteError({ project: 'notes' }));

        state.giteaFailure = 'Gitea answered 403.';
        expect(
          yield* brainstorm
            .decide(proposal.id, {
              _tag: 'Create',
              issue: { project: 'app', title: 'Dark mode', body: '' },
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
          .decide(proposal.id, { _tag: 'Create', issue: { project: 'app', title: '', body: '' } })
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
          body: '## Idea\n\nRun agents from the brainstorm.',
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
          expect(state.storedBrainstorm?.reads).toEqual([
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
              issue: { project: 'app', title: 'X', body: '' },
            })
            .pipe(Effect.flip);
          expect(error._tag).toBe('InvalidInputError');

          state.script.push([propose({ project: 'app', title: 'New', body: '' })]);
          yield* brainstorm.send('And a new one');
          yield* idle(brainstorm);
          const issue = (yield* entries(brainstorm)).find(
            (entry): entry is ProposalEntry => 'type' in entry && entry.kind === 'issue',
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

  it.effect('forgets the reads on New brainstorm, also a read that ends after it', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          yield* proposed(brainstorm, state);
          yield* brainstorm.reset();
          expect(state.storedBrainstorm?.reads).toEqual([]);

          // Pi's tools run outside the turn and may finish after it was stopped.
          const read = state.turns[0]?.tools.find((tool) => tool.name === 'read_issue');
          yield* read?.run({ project: 'app', number: 11 }) ?? Effect.void;
          expect(state.storedBrainstorm?.reads).toEqual([]);

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

describe('images in the brainstorm', () => {
  const IMAGE_A = `image${'a'.repeat(20)}a`;
  const IMAGE_B = `image${'a'.repeat(20)}b`;
  const IMAGE_C = `image${'a'.repeat(20)}c`;

  // Three uploaded images and an issue #11 of `app` that Pi can read.
  const arrange = (state: FakeState['Service']) => {
    for (const [index, id] of [IMAGE_A, IMAGE_B, IMAGE_C].entries()) {
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

  const withImages = (input: Record<string, string>, images: ReadonlyArray<number>) => ({
    tool: 'propose_issue',
    input: { ...input, images },
  });

  /** Pi gets two images and proposes an issue with image 2. */
  const proposed = (brainstorm: Brainstorm, state: FakeState['Service']) =>
    Effect.gen(function* () {
      state.script.push([
        withImages({ project: 'app', title: 'Blue door', body: 'Paint it.' }, [2]),
      ]);
      yield* brainstorm.send('Like these?', [IMAGE_A, IMAGE_B]);
      yield* idle(brainstorm);
      const proposal = proposalIn(yield* entries(brainstorm));
      if (proposal === undefined) throw new Error('Pi proposed nothing.');
      return proposal;
    });

  const gitea = (state: FakeState['Service']) =>
    state.giteaCalls.filter((call) => !call.startsWith('openIssues'));

  it.effect('sends the images to a model that sees them, numbered across the brainstorm', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          yield* brainstorm.send('Like this?', [IMAGE_A]);
          yield* idle(brainstorm);
          yield* brainstorm.send('', [IMAGE_B, IMAGE_C]);
          yield* idle(brainstorm);

          const shown = yield* brainstorm.state;
          expect(
            (yield* entries(brainstorm)).filter((entry) => entry.kind === 'said').map(strip),
          ).toEqual([
            { kind: 'said', text: 'Like this?', images: [IMAGE_A] },
            { kind: 'said', text: '', images: [IMAGE_B, IMAGE_C] },
          ]);
          expect(ready(shown)).toMatchObject({
            seesImages: true,
            images: [
              { id: IMAGE_A, number: 1, available: true },
              { id: IMAGE_B, number: 2, available: true },
              { id: IMAGE_C, number: 3, available: true },
            ],
          });
          expect(turnInputs(state)).toEqual([
            'Like this?\n\n[Image 1 attached]',
            '[Images 2, 3 attached]',
          ]);
          expect(state.turns[0]?.images).toEqual([
            { mimeType: 'image/png', bytes: new Uint8Array([0]) },
          ]);
          expect(state.turns[1]?.images).toHaveLength(2);
        }),
      arrange,
    ),
  );

  it.effect('says whether voice messages can be transcribed', () =>
    run(
      (brainstorm) =>
        Effect.gen(function* () {
          expect(ready(yield* brainstorm.state).voice).toBe(false);
        }),
      (state) => {
        state.speech.available = false;
      },
    ),
  );

  it.effect('tells Pi it cannot see the images when the model takes none', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          yield* brainstorm.send('Like this?', [IMAGE_A]);
          yield* idle(brainstorm);

          expect(turnInputs(state)).toEqual([
            'Like this?\n\n[Image 1 attached; you cannot see images]',
          ]);
          expect(state.turns[0]?.images).toEqual([]);
          expect(ready(yield* brainstorm.state).seesImages).toBe(false);
        }),
      (state) => {
        arrange(state);
        state.seesImages = false;
      },
    ),
  );

  it.effect('refuses a message with an unknown image or more than five, and changes nothing', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const unknown = yield* Effect.flip(brainstorm.send('Hi', [`image${'z'.repeat(21)}`]));
          const many = yield* Effect.flip(brainstorm.send('Hi', Array(6).fill(IMAGE_A)));

          expect(unknown._tag).toBe('InvalidInputError');
          expect(many._tag).toBe('InvalidInputError');
          expect(yield* entries(brainstorm)).toEqual([]);
          expect(state.turns).toEqual([]);
        }),
      arrange,
    ),
  );

  it.effect('shows a removed image as not available', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          yield* brainstorm.send('Look', [IMAGE_A]);
          yield* idle(brainstorm);
          state.images.delete(IMAGE_A);

          expect(ready(yield* brainstorm.state).images).toEqual([
            { id: IMAGE_A, number: 1, available: false },
          ]);
        }),
      arrange,
    ),
  );

  it.effect('keeps the images Pi names on its proposal, and refuses a wrong number', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          expect(proposal).toMatchObject({ images: [IMAGE_B], attached: [] });

          state.script.push([
            withImages({ project: 'app', title: 'Other', body: 'x' }, [7]),
            { text: 'Sorry.' },
          ]);
          yield* brainstorm.send('Another');
          yield* idle(brainstorm);
          expect((yield* entries(brainstorm)).filter((entry) => 'type' in entry)).toHaveLength(1);
        }),
      arrange,
    ),
  );

  it.effect('creates the issue, attaches the chosen images and appends them to its body', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);

          yield* brainstorm.decide(proposal.id, {
            _tag: 'Create',
            issue: { project: 'app', title: 'Blue door', body: 'Paint it.' },
            images: [IMAGE_B, IMAGE_A],
          });
          yield* idle(brainstorm);

          expect(gitea(state)).toEqual([
            'createIssue owner/app {"title":"Blue door","body":"Paint it."}',
            'attachImage owner/app 12 image-1.png',
            'attachImage owner/app 12 image-2.jpg',
            'issue owner/app 12',
            `updateIssue owner/app 12 ${JSON.stringify({
              title: 'Blue door',
              body: 'Paint it.\n\n## Images\n\n![Image 1](http://gitea.test/attachments/12/image-1.png)\n![Image 2](http://gitea.test/attachments/12/image-2.jpg)',
            })}`,
          ]);
          expect(proposalIn(yield* entries(brainstorm))).toMatchObject({
            images: [IMAGE_A, IMAGE_B],
            attached: [
              { image: IMAGE_A, url: 'http://gitea.test/attachments/12/image-1.png' },
              { image: IMAGE_B, url: 'http://gitea.test/attachments/12/image-2.jpg' },
            ],
            state: { _tag: 'created', number: 12 },
          });
          expect(turnInputs(state)[1]).toBe(
            'The owner created the issue #12 in app: "Blue door" (http://gitea.test/owner/app/issues/12), with images 1, 2.',
          );
        }),
      arrange,
    ),
  );

  it.effect('creates the issue with one request when no image is chosen', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);

          yield* brainstorm.decide(proposal.id, {
            _tag: 'Create',
            issue: { project: 'app', title: 'Blue door', body: 'Paint it.' },
            images: [],
          });

          expect(gitea(state)).toEqual([
            'createIssue owner/app {"title":"Blue door","body":"Paint it."}',
          ]);
        }),
      arrange,
    ),
  );

  it.effect('keeps a created issue and the attached images when an upload fails, and retries', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          state.giteaRefusedImages.add('image-2.jpg');
          const create = {
            _tag: 'Create',
            issue: { project: 'app', title: 'Blue door', body: 'Paint it.' },
            images: [IMAGE_A, IMAGE_B],
          } as const;

          const failed = yield* Effect.flip(brainstorm.decide(proposal.id, create));
          expect(failed).toEqual(
            new GiteaUnavailableError({ reason: 'Gitea refused image-2.jpg (422).' }),
          );
          expect(proposalIn(yield* entries(brainstorm))).toMatchObject({
            state: {
              _tag: 'attaching',
              number: 12,
              url: 'http://gitea.test/owner/app/issues/12',
            },
            attached: [{ image: IMAGE_A }],
          });
          expect(state.turns).toHaveLength(1);
          expect(
            state.storedBrainstorm?.log.filter((stored) => stored.entry.kind === 'proposal').at(-1)
              ?.entry,
          ).toMatchObject({ proposal: { state: { _tag: 'attaching' } } });

          state.giteaRefusedImages.clear();
          state.giteaCalls.length = 0;
          yield* brainstorm.decide(proposal.id, create);
          yield* idle(brainstorm);

          expect(gitea(state)).toEqual([
            'attachImage owner/app 12 image-2.jpg',
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

  it.effect('finishes without the images that are not attached and tells Pi', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          state.giteaRefusedImages.add('image-2.jpg');
          yield* Effect.flip(
            brainstorm.decide(proposal.id, {
              _tag: 'Create',
              issue: { project: 'app', title: 'Blue door', body: 'Paint it.' },
              images: [IMAGE_A, IMAGE_B],
            }),
          );
          state.giteaCalls.length = 0;

          yield* brainstorm.decide(proposal.id, { _tag: 'FinishWithout' });
          yield* idle(brainstorm);

          expect(gitea(state)).toEqual([
            'issue owner/app 12',
            `updateIssue owner/app 12 ${JSON.stringify({
              title: 'Blue door',
              body: 'Paint it.\n\n## Images\n\n![Image 1](http://gitea.test/attachments/12/image-1.png)',
            })}`,
          ]);
          expect(proposalIn(yield* entries(brainstorm))?.state).toMatchObject({ _tag: 'created' });
          expect(turnInputs(state)[1]).toContain('with images 1; image 2 was left out');
        }),
      arrange,
    ),
  );

  it.effect('appends no second Images block when the body already links them', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          state.giteaRefusedImages.add('image-2.jpg');
          yield* Effect.flip(
            brainstorm.decide(proposal.id, {
              _tag: 'Create',
              issue: { project: 'app', title: 'Blue door', body: 'Paint it.' },
              images: [IMAGE_A, IMAGE_B],
            }),
          );
          // An earlier update reached Gitea, but its answer was lost.
          const linked =
            'Paint it.\n\n## Images\n\n![Image 1](http://gitea.test/attachments/12/image-1.png)';
          state.issues.set(
            'owner/app',
            (state.issues.get('owner/app') ?? []).map((issue) =>
              issue.number === 12 ? { ...issue, body: linked } : issue,
            ),
          );
          state.giteaCalls.length = 0;

          yield* brainstorm.decide(proposal.id, { _tag: 'FinishWithout' });

          expect(gitea(state)).toEqual(['issue owner/app 12']);
          expect(proposalIn(yield* entries(brainstorm))?.state).toMatchObject({ _tag: 'created' });
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

          state.giteaRefusedImages.add('image-2.jpg');
          yield* Effect.flip(
            brainstorm.decide(proposal.id, {
              _tag: 'Create',
              issue: { project: 'app', title: 'Blue door', body: 'Paint it.' },
              images: [IMAGE_B],
            }),
          );
          const discard = yield* Effect.flip(brainstorm.decide(proposal.id, { _tag: 'Discard' }));
          expect(discard._tag).toBe('InvalidInputError');
        }),
      arrange,
    ),
  );

  it.effect('refuses a removed or unknown image before any Gitea request', () =>
    run(
      (brainstorm, state) =>
        Effect.gen(function* () {
          const proposal = yield* proposed(brainstorm, state);
          state.images.delete(IMAGE_B);
          const issue = { project: 'app', title: 'Blue door', body: 'Paint it.' };

          const removed = yield* Effect.flip(
            brainstorm.decide(proposal.id, { _tag: 'Create', issue, images: [IMAGE_B] }),
          );
          const unknown = yield* Effect.flip(
            brainstorm.decide(proposal.id, { _tag: 'Create', issue, images: [IMAGE_C] }),
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
              images: [1],
            },
          },
        ]);
        yield* brainstorm.send('Add this to #11', [IMAGE_A]);
        yield* idle(brainstorm);
        const proposal = proposalIn(yield* entries(brainstorm));
        if (proposal === undefined) throw new Error('Pi proposed nothing.');
        state.giteaCalls.length = 0;
        return proposal;
      });

    it.effect('checks the base, attaches the images and appends them to the shown body', () =>
      run(
        (brainstorm, state) =>
          Effect.gen(function* () {
            const proposal = yield* edited(brainstorm, state);
            expect(proposal).toMatchObject({ images: [IMAGE_A] });

            yield* brainstorm.decide(proposal.id, {
              _tag: 'Apply',
              title: 'Orchestrator',
              body: 'Run agents from the brainstorm.',
              images: [IMAGE_A],
            });
            yield* idle(brainstorm);

            expect(gitea(state)).toEqual([
              'issue owner/app 11',
              'attachImage owner/app 11 image-1.png',
              `updateIssue owner/app 11 ${JSON.stringify({
                title: 'Orchestrator',
                body: 'Run agents from the brainstorm.\n\n## Images\n\n![Image 1](http://gitea.test/attachments/11/image-1.png)',
              })}`,
            ]);
            expect(proposalIn(yield* entries(brainstorm))?.state).toMatchObject({
              _tag: 'updated',
            });
            expect(turnInputs(state)[1]).toContain('with images 1');
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
                images: [IMAGE_A],
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
            yield* brainstorm.send('And this', [IMAGE_B]);
            yield* idle(brainstorm);
            state.giteaRefusedImages.add('image-2.jpg');
            state.giteaCalls.length = 0;
            const apply = {
              _tag: 'Apply',
              title: 'Orchestrator',
              body: 'Run agents.',
              images: [IMAGE_A, IMAGE_B],
            } as const;

            yield* Effect.flip(brainstorm.decide(proposal.id, apply));
            expect(gitea(state).filter((call) => call.startsWith('updateIssue'))).toEqual([]);
            expect(proposalIn(yield* entries(brainstorm))).toMatchObject({
              state: { _tag: 'open' },
              attached: [{ image: IMAGE_A }],
            });

            state.giteaRefusedImages.clear();
            state.giteaCalls.length = 0;
            yield* brainstorm.decide(proposal.id, apply);

            expect(gitea(state).filter((call) => call.startsWith('attachImage'))).toEqual([
              'attachImage owner/app 11 image-2.jpg',
            ]);
          }),
        arrange,
      ),
    );
  });
});
