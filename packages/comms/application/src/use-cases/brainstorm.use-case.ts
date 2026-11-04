import {
  baseChanged,
  InvalidInputError,
  parseIssueDraft,
  parseIssueEdit,
  parsePrompt,
  proposalOf,
  readOf,
  rememberRead,
  settleProposal,
  type BrainstormEntry,
  type EditProposal,
  type IssueDraft,
  type IssueProposal,
  type IssueRead,
  type IssueText,
  type ProposalEntry,
} from '@pocket-comms/comms-domain';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Option from 'effect/Option';
import * as PubSub from 'effect/PubSub';
import * as Result from 'effect/Result';
import * as Semaphore from 'effect/Semaphore';
import * as Stream from 'effect/Stream';
import type {
  BrainstormEventDto,
  BrainstormStateDto,
  ProposalDecisionInput,
} from '../dto/brainstorm.dto.js';
import {
  AgentRuntimeError,
  BrainstormBusyError,
  BrainstormNotSetUpError,
  IssueChangedError,
  IssueNotFoundError,
  NoGiteaRemoteError,
  ProposalDecidedError,
  ProposalNotFoundError,
} from '../errors.js';
import { AgentRuntimeOutbound } from '../ports/agent-runtime.outbound.port.js';
import {
  BrainstormStoreOutbound,
  type StoredChat,
} from '../ports/brainstorm-store.outbound.port.js';
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { makeBrainstormTools, type EditDraft } from '../tools/brainstorm-tools.js';
import { makeIssueProject } from './issue-project.js';

// The brainstorm chat (spec 013): one conversation with Pi, kept in the store after every change.
// One turn runs at a time, in the background of the server; the sheet follows it live.

/** What Pi is told it is for (requirement 9). */
export const BRAINSTORM_INSTRUCTIONS = `You are Pi, the owner's brainstorm partner inside pocket-comms, an app on their phone. The owner writes or dictates ideas on the go, often in a few rough words. Help them think an idea through: ask a short question when it is unclear, suggest angles they may have missed, and keep answers brief, because they read on a phone.

You can look at the owner's projects (list_projects), a project's open issues (list_open_issues), one issue in full (read_issue) and a project's README.md or AGENTS.md (read_project_doc). You cannot read other files or run commands.

When an idea is clear enough to keep, propose it as a Gitea issue in the project it belongs to with propose_issue: a short title, and a Markdown body with the idea, why it matters and a rough shape. Check the open issues first so nothing is filed twice.

When an idea belongs to an issue that exists, read it with read_issue and propose an edit with propose_issue_edit instead of a new issue. Send the whole new title and body, and keep every part of the body the edit is not about.

You change nothing yourself: the owner decides on every proposal. Never claim an issue exists or was changed before the owner did it.`;

const newId = () => crypto.randomUUID();

/** How long one turn of Pi may take, so a hung model never keeps the chat busy for good. */
const TURN_DEADLINE = '5 minutes';

const emptyChat = (): StoredChat => ({
  id: newId(),
  entries: [],
  reads: [],
  runtime: Option.none(),
});

/** A decision that does not fit the kind of proposal it is for. */
const mismatch = (proposal: ProposalEntry) =>
  new InvalidInputError({
    issues: [
      {
        field: '_tag',
        message:
          proposal.kind === 'issue'
            ? 'This proposal is a new issue: create it or discard it.'
            : `This proposal edits issue #${proposal.number}: apply it or discard it.`,
      },
    ],
  });

/** What Pi is told about the owner's decision, as the input of its next turn. */
const decisionNote = (decided: ProposalEntry): string => {
  if (decided.kind === 'edit') {
    return decided.state._tag === 'updated'
      ? `The owner updated the issue #${decided.number} in ${decided.project}: it is now "${decided.title}" with the body you proposed or the owner edited (${decided.state.url}).`
      : `The owner discarded your edit of the issue #${decided.number} in ${decided.project}.`;
  }
  return decided.state._tag === 'created'
    ? `The owner created the issue #${decided.state.number} in ${decided.project}: "${decided.title}" (${decided.state.url}).`
    : `The owner discarded the proposal "${decided.title}" for ${decided.project}.`;
};

export const makeBrainstorm = Effect.gen(function* () {
  const runtime = yield* AgentRuntimeOutbound;
  const store = yield* BrainstormStoreOutbound;
  const giteaOutbound = yield* GiteaOutbound;
  const issueProject = yield* makeIssueProject;
  const toolsFor = yield* makeBrainstormTools;
  // Turns run in the scope of the layer, so they outlive the request that started them.
  const scope = yield* Effect.scope;
  const updates = yield* PubSub.unbounded<BrainstormEventDto>();
  // One change of the chat at a time, so two decisions never create the same issue twice.
  const lock = yield* Semaphore.make(1);

  let chat = Option.getOrElse(yield* store.load, emptyChat);
  let answering = false;
  let turn: Option.Option<Fiber.Fiber<void>> = Option.none();
  let live = '';

  const currentState = (): BrainstormStateDto =>
    Option.match(runtime.notSetUp, {
      onSome: (reason) => ({ _tag: 'NotSetUp', reason }),
      onNone: () => ({
        _tag: 'Ready',
        entries: chat.entries,
        answering,
        live,
      }),
    });

  const publishState = Effect.asVoid(
    Effect.suspend(() => PubSub.publish(updates, { type: 'state', state: currentState() })),
  );

  /** Replaces the chat, saves it and tells every follower. */
  const change = (next: StoredChat) =>
    Effect.suspend(() => {
      chat = next;
      return Effect.andThen(store.save(next), publishState);
    });

  /**
   * Adds an entry to the chat `chatId`. A turn's late write after New chat changes nothing: Pi's
   * tools may still finish after their turn was stopped.
   */
  const append = (chatId: string, entry: (at: number) => BrainstormEntry) =>
    Effect.flatMap(Clock.currentTimeMillis, (at) =>
      Effect.suspend(() =>
        chat.id === chatId
          ? change({ ...chat, entries: [...chat.entries, entry(at)] })
          : Effect.void,
      ),
    );

  /** Adds a proposal to the chat `chatId` and answers its id. */
  const proposeIn = (chatId: string, proposal: (id: string, at: number) => ProposalEntry) =>
    Effect.suspend(() => {
      const id = newId();
      return Effect.as(
        append(chatId, (at) => proposal(id, at)),
        id,
      );
    });

  /** What the tools of a turn do in the chat `chatId`. */
  const hooksFor = (chatId: string) => ({
    propose: (draft: IssueDraft) =>
      proposeIn(chatId, (id, at) => ({
        type: 'proposal',
        kind: 'issue',
        id,
        at,
        ...draft,
        state: { _tag: 'open' },
      })),
    proposeEdit: ({ read, title, body }: EditDraft) =>
      proposeIn(chatId, (id, at) => ({
        type: 'proposal',
        kind: 'edit',
        id,
        at,
        project: read.project,
        number: read.number,
        url: read.url,
        title,
        body,
        base: { title: read.title, body: read.body },
        state: { _tag: 'open' },
      })),
    remember: (read: IssueRead) =>
      Effect.suspend(() =>
        chat.id === chatId
          ? change({ ...chat, reads: rememberRead(chat.reads, read) })
          : Effect.void,
      ),
    readOf: (project: string, number: number) =>
      Effect.sync(() => (chat.id === chatId ? readOf(chat.reads, project, number) : undefined)),
  });

  const ensureSetUp = Option.match(runtime.notSetUp, {
    onSome: (reason) => Effect.fail(new BrainstormNotSetUpError({ reason })),
    onNone: () => Effect.void,
  });

  const ensureIdle = Effect.suspend(() =>
    answering ? Effect.fail(new BrainstormBusyError()) : Effect.void,
  );

  /**
   * Runs one turn of Pi to its end, within `TURN_DEADLINE`. A failure keeps what came before and
   * is shown.
   */
  const runTurn = (input: string) => {
    const chatId = chat.id;
    const failed = (reason: string) =>
      append(chatId, (at) => ({ type: 'failed', id: newId(), at, reason }));
    return runtime
      .runTurn({
        sessionId: chatId,
        instructions: BRAINSTORM_INSTRUCTIONS,
        state: chat.runtime,
        input,
        tools: toolsFor(hooksFor(chatId)),
      })
      .pipe(
        Stream.runForEach((event) => {
          switch (event._tag) {
            case 'textDelta':
              live += event.text;
              return Effect.asVoid(PubSub.publish(updates, { type: 'delta', text: event.text }));
            case 'message':
              live = '';
              return append(chatId, (at) => ({
                type: 'assistant',
                id: newId(),
                at,
                text: event.text,
              }));
            case 'ended':
              return Effect.suspend(() =>
                chat.id === chatId
                  ? change({ ...chat, runtime: Option.some(event.state) })
                  : Effect.void,
              );
            default:
              return Effect.void;
          }
        }),
        Effect.timeoutOrElse({
          duration: TURN_DEADLINE,
          orElse: () =>
            Effect.fail(new AgentRuntimeError({ reason: 'Pi did not answer within 5 minutes.' })),
        }),
        Effect.catchTag('AgentRuntimeError', (error) => failed(error.reason)),
        // Whatever else fails a turn is shown too, so the chat never ends a turn without a word.
        Effect.catchDefect(() => failed('The turn failed unexpectedly.')),
        Effect.withSpan('Brainstorm.turn'),
      );
  };

  /** Starts a turn in the background; the chat is busy until it ends. */
  const startTurn = (input: string) =>
    Effect.gen(function* () {
      answering = true;
      yield* publishState;
      const fiber = yield* runTurn(input).pipe(
        Effect.ensuring(
          Effect.suspend(() => {
            answering = false;
            live = '';
            return publishState;
          }),
        ),
        Effect.forkIn(scope),
      );
      turn = Option.some(fiber);
    });

  const repositoryOf = (project: string) =>
    Effect.gen(function* () {
      const { repository } = yield* issueProject(project).pipe(
        Effect.catchTag('ProjectNotFoundError', (error) =>
          Effect.fail(
            new InvalidInputError({
              issues: [{ field: 'project', message: `There is no project ${error.project}.` }],
            }),
          ),
        ),
      );
      if (Option.isNone(repository)) return yield* new NoGiteaRemoteError({ project });
      return repository.value;
    });

  /** Creates the proposed issue as the owner edited it; the proposal as decided. */
  const createIssue = (proposal: IssueProposal, edited: IssueDraft) =>
    Effect.gen(function* () {
      const draft = parseIssueDraft(edited);
      if (Result.isFailure(draft)) return yield* draft.failure;
      const repository = yield* repositoryOf(draft.success.project);
      const created = yield* giteaOutbound.createIssue(repository, {
        title: draft.success.title,
        body: draft.success.body,
      });
      yield* Effect.logInfo('Issue created').pipe(
        Effect.annotateLogs({ project: draft.success.project, number: created.number }),
      );
      return {
        ...proposal,
        ...draft.success,
        state: { _tag: 'created', number: created.number, url: created.url },
      } satisfies IssueProposal;
    });

  /**
   * Applies the edit as the owner changed it, unless the issue's title or body changed since Pi
   * read it; the proposal as decided. Gitea has no conditional update, so the check and the
   * write are two requests.
   */
  const applyEdit = (proposal: EditProposal, edited: IssueText) =>
    Effect.gen(function* () {
      const text = parseIssueEdit(edited);
      if (Result.isFailure(text)) return yield* text.failure;
      const repository = yield* repositoryOf(proposal.project);
      const current = yield* giteaOutbound.issue(repository, proposal.number);
      if (current.pull) return yield* new IssueNotFoundError({ number: proposal.number });
      if (baseChanged(proposal.base, current)) {
        return yield* new IssueChangedError({ number: proposal.number });
      }
      yield* giteaOutbound.updateIssue(repository, proposal.number, text.success);
      yield* Effect.logInfo('Issue updated').pipe(
        Effect.annotateLogs({ project: proposal.project, number: proposal.number }),
      );
      return {
        ...proposal,
        ...text.success,
        state: { _tag: 'updated', url: current.url },
      } satisfies EditProposal;
    });

  const state = Effect.sync(currentState);

  const events: Stream.Stream<BrainstormEventDto> = Stream.unwrap(
    Effect.map(PubSub.subscribe(updates), (subscription) =>
      Stream.concat(
        Stream.sync(() => ({ type: 'state', state: currentState() }) as const),
        Stream.fromSubscription(subscription),
      ),
    ),
  );

  const send = Effect.fn('Brainstorm.send')(function* (text: string) {
    yield* ensureSetUp;
    const parsed = parsePrompt(text);
    if (Result.isFailure(parsed)) return yield* parsed.failure;
    yield* ensureIdle;
    yield* append(chat.id, (at) => ({ type: 'user', id: newId(), at, text: parsed.success }));
    yield* startTurn(parsed.success);
  }, lock.withPermits(1));

  const decide = Effect.fn('Brainstorm.decide')(function* (
    id: string,
    decision: ProposalDecisionInput,
  ) {
    yield* ensureSetUp;
    yield* ensureIdle;
    const proposal = proposalOf(chat.entries, id);
    if (proposal === undefined) return yield* new ProposalNotFoundError({ id });
    if (proposal.state._tag !== 'open') return yield* new ProposalDecidedError({ id });
    const decided: ProposalEntry =
      decision._tag === 'Discard'
        ? { ...proposal, state: { _tag: 'discarded' } }
        : decision._tag === 'Create' && proposal.kind === 'issue'
          ? yield* createIssue(proposal, decision.draft)
          : decision._tag === 'Apply' && proposal.kind === 'edit'
            ? yield* applyEdit(proposal, decision)
            : yield* mismatch(proposal);
    yield* change({
      ...chat,
      entries: settleProposal(chat.entries, decided),
      // Pi's next edit of the issue starts from the version the owner just saved.
      reads:
        decided.kind === 'edit' && decided.state._tag === 'updated'
          ? rememberRead(chat.reads, {
              project: decided.project,
              number: decided.number,
              url: decided.url,
              title: decided.title,
              body: decided.body,
              cut: false,
            })
          : chat.reads,
    });
    yield* startTurn(decisionNote(decided));
  }, lock.withPermits(1));

  const reset = Effect.fn('Brainstorm.reset')(function* () {
    if (Option.isSome(turn)) yield* Fiber.interrupt(turn.value);
    turn = Option.none();
    yield* change(emptyChat());
  }, lock.withPermits(1));

  return { state, events, send, decide, reset };
});
