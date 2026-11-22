import {
  baseChanged,
  brainstormImages,
  IMAGE_EXTENSIONS,
  IMAGE_MEDIA_TYPES,
  InvalidInputError,
  missingImages,
  parseImageIds,
  parseProposedIssue,
  parseIssueEdit,
  parseImageChoice,
  parsePrompt,
  imagesByNumber,
  proposalOf,
  readOf,
  rememberRead,
  withImages,
  type AttachedImage,
  type BrainstormEntry,
  type EditProposal,
  type ProposedIssue,
  type IssueProposal,
  type IssueRead,
  type IssueText,
  type ProposalEntry,
} from '@pocket-comms/comms-domain';
import {
  AgentRuntime,
  chatSink,
  defaultReasonOf,
  makeChatFeed,
  makeTurnEngine,
  Transcriber,
  type ChatLog,
  type TurnSink,
} from '@smotastic/pocket-agent';
import { isChatEntry } from '@smotastic/pocket-agent/chat';
import * as Cause from 'effect/Cause';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import * as Semaphore from 'effect/Semaphore';
import type * as Stream from 'effect/Stream';
import type {
  BrainstormEventDto,
  BrainstormStateDto,
  ProposalDecisionInput,
} from '../dto/brainstorm.dto.js';
import {
  BrainstormBusyError,
  BrainstormNotSetUpError,
  IssueChangedError,
  IssueNotFoundError,
  NoGiteaRemoteError,
  ProposalDecidedError,
  ProposalNotFoundError,
} from '../errors.js';
import {
  BrainstormStoreOutbound,
  type StoredBrainstorm,
} from '../ports/brainstorm-store.outbound.port.js';
import { GiteaOutbound, type LinkedRepository } from '../ports/gitea.outbound.port.js';
import { ImagesOutbound, type StoredImage } from '../ports/images.outbound.port.js';
import {
  describeBrainstormCall,
  makeBrainstormTools,
  type ProposedEdit,
} from '../tools/brainstorm-tools.js';
import { makeIssueProject } from './issue-project.js';

// The brainstorm (spec 013): one conversation with Pi, kept in the store after every change.
// One turn runs at a time, in the background of the server, on the agent package's turn engine
// (ADR 0014); the sheet follows it live through the package's chat feed (spec 026). The owner's
// messages may attach images, which go to Gitea with an issue the owner approves (spec 023).

/** What Pi is told it is for (requirement 9). */
export const BRAINSTORM_INSTRUCTIONS = `You are Pi, the owner's brainstorm partner inside pocket-comms, an app on their phone. The owner writes or dictates ideas on the go, often in a few rough words. Help them think an idea through: ask a short question when it is unclear, suggest angles they may have missed, and keep answers brief, because they read on a phone.

You can look at the owner's projects (list_projects), a project's open issues (list_open_issues), one issue in full (read_issue) and a project's README.md or AGENTS.md (read_project_doc). You cannot read other files or run commands.

When an idea is clear enough to keep, propose it as a Gitea issue in the project it belongs to with propose_issue: a short title, and a Markdown body with the idea, why it matters and a rough shape. Check the open issues first so nothing is filed twice.

When an idea belongs to an issue that exists, read it with read_issue and propose an edit with propose_issue_edit instead of a new issue. Send the whole new title and body, and keep every part of the body the edit is not about.

The owner may attach images to a message; each has a number, such as [Image 2 attached]. When images belong to an issue, name their numbers in images when you propose it or an edit. The app attaches them to the issue and links them below the body, so do not link them yourself.

You change nothing yourself: the owner decides on every proposal. Never claim an issue exists or was changed before the owner did it.`;

const newId = () => crypto.randomUUID();

const discarded = <P extends ProposalEntry>(proposal: P): P => ({
  ...proposal,
  state: { _tag: 'discarded' },
});

/** How long one turn of Pi may take, so a hung model never keeps the brainstorm busy for good. */
const TURN_DEADLINE = '5 minutes';

/** Why a turn failed, as the brainstorm shows it; a defect has no reason the owner could use. */
const reasonOf = (cause: Cause.Cause<unknown>) =>
  Cause.hasDies(cause) ? 'The turn failed unexpectedly.' : defaultReasonOf(cause);

const emptyBrainstorm = (): StoredBrainstorm => ({
  id: newId(),
  log: [],
  reads: [],
  runtime: Option.none(),
});

/**
 * The key of the brainstorm's feed. The server has one brainstorm, so its entries are numbered on across a
 * New brainstorm, and a sheet that follows from an older number still gets the new brainstorm's start.
 */
const FEED = 'brainstorm';

/** The brainstorm's own entries, without the package's shared ones. */
const ownEntries = (ongoing: StoredBrainstorm): ReadonlyArray<BrainstormEntry> =>
  ongoing.log.flatMap(({ entry }) => (isChatEntry(entry) ? [] : [entry]));

/** A decision that does not fit the kind of proposal it is for, or the state it is in. */
const mismatch = (proposal: ProposalEntry) =>
  new InvalidInputError({
    issues: [
      {
        field: '_tag',
        message:
          proposal.kind === 'edit'
            ? `This proposal edits issue #${proposal.number}: apply it or discard it.`
            : proposal.state._tag === 'attaching'
              ? `Issue #${proposal.state.number} exists: retry its images or finish without them.`
              : 'This proposal is a new issue: create it or discard it.',
      },
    ],
  });

/** The number of each image of the brainstorm, by its id. */
const numbersOf = (entries: ReadonlyArray<BrainstormEntry>) =>
  new Map(brainstormImages(entries).map((image) => [image.id, image.number]));

const listed = (numbers: ReadonlyArray<number>) => numbers.join(', ');

/** What Pi is told about the owner's decision, as the input of its next turn. */
const decisionNote = (decided: ProposalEntry, numbers: ReadonlyMap<string, number>): string => {
  const numberOf = (id: string) => numbers.get(id) ?? 0;
  const attached = decided.attached.map((image) => numberOf(image.image));
  const left = missingImages(decided.images, decided.attached).map(numberOf);
  const images =
    (attached.length === 0 ? '' : `, with images ${listed(attached)}`) +
    (left.length === 0
      ? ''
      : `; ${left.length === 1 ? 'image' : 'images'} ${listed(left)} ${left.length === 1 ? 'was' : 'were'} left out`);
  if (decided.kind === 'edit') {
    return decided.state._tag === 'updated'
      ? `The owner updated the issue #${decided.number} in ${decided.project}: it is now "${decided.title}" with the body you proposed or the owner edited (${decided.state.url})${images}.`
      : `The owner discarded your edit of the issue #${decided.number} in ${decided.project}.`;
  }
  return decided.state._tag === 'created'
    ? `The owner created the issue #${decided.state.number} in ${decided.project}: "${decided.title}" (${decided.state.url})${images}.`
    : `The owner discarded the proposal "${decided.title}" for ${decided.project}.`;
};

/** What Pi reads about the images of a message, after its text. */
const imagesNote = (numbers: ReadonlyArray<number>, seen: boolean) =>
  numbers.length === 0
    ? ''
    : `[${numbers.length === 1 ? 'Image' : 'Images'} ${listed(numbers)} attached${seen ? '' : '; you cannot see images'}]`;

export const makeBrainstorm = Effect.gen(function* () {
  const runtime = yield* AgentRuntime;
  const store = yield* BrainstormStoreOutbound;
  const giteaOutbound = yield* GiteaOutbound;
  const imagesOutbound = yield* ImagesOutbound;
  const transcriber = yield* Transcriber;
  const issueProject = yield* makeIssueProject;
  const toolsFor = yield* makeBrainstormTools;
  // Turns run in the scope of the layer, so they outlive the request that started them.
  const engine = yield* makeTurnEngine({ deadline: TURN_DEADLINE, reasonOf });
  // One change of the brainstorm at a time, so two decisions never create the same issue twice.
  const lock = yield* Semaphore.make(1);

  let ongoing = Option.getOrElse(yield* store.load, emptyBrainstorm);
  let answering = false;
  // The number of the last entry; a New brainstorm goes on from it.
  let sequence = ongoing.log.at(-1)?.sequence ?? 0;

  /** The brainstorm's entries behind the package's port, saved with the brainstorm after each one. */
  const log: ChatLog<BrainstormEntry> = {
    append: (_key, entry) =>
      Effect.suspend(() => {
        sequence += 1;
        ongoing = { ...ongoing, log: [...ongoing.log, { sequence, entry }] };
        return Effect.as(store.save(ongoing), sequence);
      }),
    list: (_key, after) =>
      Effect.sync(() => ongoing.log.filter((stored) => stored.sequence > after)),
  };
  const feed = yield* makeChatFeed(log);

  const currentState = Effect.suspend((): Effect.Effect<BrainstormStateDto> => {
    if (Option.isSome(runtime.notSetUp)) {
      return Effect.succeed({ _tag: 'NotSetUp', reason: runtime.notSetUp.value });
    }
    // A image the clean-up removed can no longer go to Gitea (spec 023, requirement 10).
    return Effect.map(
      Effect.forEach(brainstormImages(ownEntries(ongoing)), (image) =>
        Effect.map(imagesOutbound.path(image.id), (path) => ({
          ...image,
          available: Option.isSome(path),
        })),
      ),
      (images) => ({
        _tag: 'Ready',
        answering,
        seesImages: runtime.seesImages ?? false,
        images,
        voice: transcriber.available,
      }),
    );
  });

  /** Replaces the brainstorm's other parts and saves it; its entries change only through the feed. */
  const change = (next: StoredBrainstorm) =>
    Effect.suspend(() => {
      ongoing = next;
      return store.save(next);
    });

  /**
   * Records an entry of the brainstorm `brainstormId`. A turn's late write after New brainstorm changes nothing: Pi's
   * tools may still finish after their turn was stopped.
   */
  const recordIn = (brainstormId: string, entry: (at: number) => BrainstormEntry) =>
    Effect.flatMap(Clock.currentTimeMillis, (at) =>
      Effect.suspend(() =>
        ongoing.id === brainstormId ? Effect.asVoid(feed.record(FEED, entry(at))) : Effect.void,
      ),
    );

  /** Records a proposal in the brainstorm `brainstormId` and answers its id. */
  const proposeIn = (brainstormId: string, proposal: (id: string, at: number) => ProposalEntry) =>
    Effect.suspend(() => {
      const id = newId();
      return Effect.as(
        recordIn(brainstormId, (at) => ({ kind: 'proposal', proposal: proposal(id, at) })),
        id,
      );
    });

  /** What the tools of a turn do in the brainstorm `brainstormId`. */
  const hooksFor = (brainstormId: string) => ({
    propose: (issue: ProposedIssue, images: ReadonlyArray<string>) =>
      proposeIn(brainstormId, (id, at) => ({
        type: 'proposal',
        kind: 'issue',
        id,
        at,
        ...issue,
        images,
        attached: [],
        state: { _tag: 'open' },
      })),
    proposeEdit: ({ read, title, body, images }: ProposedEdit) =>
      proposeIn(brainstormId, (id, at) => ({
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
        images,
        attached: [],
        state: { _tag: 'open' },
      })),
    remember: (read: IssueRead) =>
      Effect.suspend(() =>
        ongoing.id === brainstormId
          ? change({ ...ongoing, reads: rememberRead(ongoing.reads, read) })
          : Effect.void,
      ),
    readOf: (project: string, number: number) =>
      Effect.sync(() =>
        ongoing.id === brainstormId ? readOf(ongoing.reads, project, number) : undefined,
      ),
    images: (numbers: ReadonlyArray<number>) =>
      Effect.sync(() => imagesByNumber(ownEntries(ongoing), numbers)),
  });

  const ensureSetUp = Option.match(runtime.notSetUp, {
    onSome: (reason) => Effect.fail(new BrainstormNotSetUpError({ reason })),
    onNone: () => Effect.void,
  });

  const ensureIdle = Effect.suspend(() =>
    answering ? Effect.fail(new BrainstormBusyError()) : Effect.void,
  );

  /**
   * The turn is over: the brainstorm takes the next message. It is idle before the turn's end is
   * recorded, so a sheet that reads the state on that entry sees it idle.
   */
  const finished = Effect.sync(() => {
    answering = false;
  });

  /**
   * Where the events of a turn in the brainstorm `brainstormId` go: the package's sink writes the reply, each
   * tool as its summary and the turn's end to the feed. A failed save of the end is shown as a
   * failure.
   */
  const sinkOf = (brainstormId: string): TurnSink => {
    const sink = chatSink(feed, FEED, {
      ended: (state) =>
        Effect.suspend(() =>
          ongoing.id === brainstormId
            ? change({ ...ongoing, runtime: Option.some(state) })
            : Effect.void,
        ).pipe(Effect.ensuring(finished)),
      describeCall: describeBrainstormCall,
      reasonOf: () => 'The brainstorm could not be saved after this answer.',
    });
    return {
      ...sink,
      failed: (reason) => Effect.andThen(finished, sink.failed(reason)),
      stopped: () => Effect.andThen(finished, sink.stopped?.() ?? Effect.void),
    };
  };

  /**
   * Starts a turn in the background, within `TURN_DEADLINE`. The caller marks the brainstorm answering
   * before it records what starts the turn; the turn's end marks it idle.
   */
  const startTurn = (input: string, images: ReadonlyArray<StoredImage> = []) =>
    Effect.gen(function* () {
      const brainstormId = ongoing.id;
      // The turn before may still be leaving the engine after its end was shown.
      yield* engine.awaitTurn(brainstormId);
      yield* engine
        .start({
          key: brainstormId,
          input,
          images: images.map((image) => ({
            mimeType: IMAGE_MEDIA_TYPES[image.kind],
            bytes: image.bytes,
          })),
          prepare: Effect.sync(() => ({
            instructions: BRAINSTORM_INSTRUCTIONS,
            tools: toolsFor(hooksFor(brainstormId)),
            state: ongoing.runtime,
          })),
          sink: sinkOf(brainstormId),
        })
        // The brainstorm is idle here and holds the lock, so a busy key is a bug.
        .pipe(Effect.orDie);
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

  const removed = (number: number) =>
    new InvalidInputError({
      issues: [{ field: 'images', message: `Image ${number} was removed from the app.` }],
    });

  /** The owner's choice of brainstorm images, in number order, each still kept by the app. */
  const chooseImages = (ids: ReadonlyArray<string> = []) =>
    Effect.gen(function* () {
      const chosen = yield* Effect.fromResult(parseImageChoice(ownEntries(ongoing), ids));
      const numbers = numbersOf(ownEntries(ongoing));
      for (const id of chosen) {
        if (Option.isNone(yield* imagesOutbound.path(id))) {
          return yield* removed(numbers.get(id) ?? 0);
        }
      }
      return chosen;
    });

  /** Records the proposal as it is now, so its progress survives a failure and a restart. */
  const saveProposal = (proposal: ProposalEntry) =>
    Effect.asVoid(feed.record(FEED, { kind: 'proposal', proposal }));

  /**
   * Uploads the chosen images that are not attached yet to the issue, saving the proposal after
   * each, so a retry never uploads one twice; the proposal with them.
   */
  const attachImages = <P extends ProposalEntry>(
    proposal: P,
    repository: LinkedRepository,
    number: number,
  ) =>
    Effect.gen(function* () {
      const numbers = numbersOf(ownEntries(ongoing));
      let current = proposal;
      for (const id of missingImages(current.images, current.attached)) {
        const imageNumber = numbers.get(id) ?? 0;
        const image = yield* imagesOutbound.read(id);
        if (Option.isNone(image)) return yield* removed(imageNumber);
        const url = yield* giteaOutbound.attachImage(repository, number, {
          name: `image-${imageNumber}.${IMAGE_EXTENSIONS[image.value.kind]}`,
          kind: image.value.kind,
          bytes: image.value.bytes,
        });
        current = { ...current, attached: [...current.attached, { image: id, url }] };
        yield* saveProposal(current);
      }
      return current;
    });

  /** The body with an Images block of the attached images in `ids`, in number order. */
  const bodyWithImages = (
    body: string,
    attached: ReadonlyArray<AttachedImage>,
    ids: ReadonlyArray<string>,
  ) => {
    const numbers = numbersOf(ownEntries(ongoing));
    return withImages(
      body,
      attached
        .filter((image) => ids.includes(image.image))
        .map((image) => ({ number: numbers.get(image.image) ?? 0, url: image.url }))
        .sort((a, b) => a.number - b.number),
    );
  };

  /**
   * Links the attached images below the issue's current body, which keeps whatever changed in
   * Gitea since the issue was created; the proposal as created.
   */
  const linkImages = (
    proposal: IssueProposal,
    repository: LinkedRepository,
    created: { readonly number: number; readonly url: string },
  ) =>
    Effect.gen(function* () {
      if (proposal.attached.length > 0) {
        const current = yield* giteaOutbound.issue(repository, created.number);
        // An earlier update may have reached Gitea although its answer was lost.
        const linked = proposal.attached.every((image) => current.body.includes(image.url));
        if (!linked)
          yield* giteaOutbound.updateIssue(repository, created.number, {
            title: current.title,
            body: bodyWithImages(current.body, proposal.attached, proposal.images),
          });
      }
      return {
        ...proposal,
        state: { _tag: 'created', number: created.number, url: created.url },
      } satisfies IssueProposal;
    });

  /** Uploads the missing images of a created issue, then links them; the proposal as created. */
  const finishImages = (proposal: IssueProposal, created: { number: number; url: string }) =>
    Effect.gen(function* () {
      const repository = yield* repositoryOf(proposal.project);
      const attached = yield* attachImages(proposal, repository, created.number);
      return yield* linkImages(attached, repository, created);
    });

  /**
   * Creates the proposed issue as the owner edited it, then attaches the chosen images; the
   * proposal as decided. Gitea attaches a image only to an issue that exists, so the proposal
   * is `attaching` in between (spec 023, requirement 16).
   */
  const createIssue = (
    proposal: IssueProposal,
    edited: ProposedIssue,
    chosen: ReadonlyArray<string> | undefined,
  ) =>
    Effect.gen(function* () {
      const proposed = parseProposedIssue(edited);
      if (Result.isFailure(proposed)) return yield* proposed.failure;
      const images = yield* chooseImages(chosen);
      const repository = yield* repositoryOf(proposed.success.project);
      const created = yield* giteaOutbound.createIssue(repository, {
        title: proposed.success.title,
        body: proposed.success.body,
      });
      yield* Effect.logInfo('Issue created').pipe(
        Effect.annotateLogs({ project: proposed.success.project, number: created.number }),
      );
      const withIssue = { ...proposal, ...proposed.success, images } satisfies IssueProposal;
      if (images.length === 0) {
        return {
          ...withIssue,
          state: { _tag: 'created', number: created.number, url: created.url },
        } satisfies IssueProposal;
      }
      const attaching = {
        ...withIssue,
        state: { _tag: 'attaching', number: created.number, url: created.url },
      } as const;
      yield* saveProposal(attaching);
      return yield* finishImages(attaching, created);
    });

  /**
   * Applies the edit as the owner changed it, unless the issue's title or body changed since Pi
   * read it, with the chosen images attached first; the proposal as decided. Gitea has no
   * conditional update, so the check and the write are two requests.
   */
  const applyEdit = (
    proposal: EditProposal,
    edited: IssueText,
    chosen: ReadonlyArray<string> | undefined,
  ) =>
    Effect.gen(function* () {
      const text = parseIssueEdit(edited);
      if (Result.isFailure(text)) return yield* text.failure;
      const images = yield* chooseImages(chosen);
      const repository = yield* repositoryOf(proposal.project);
      const current = yield* giteaOutbound.issue(repository, proposal.number);
      if (current.pull) return yield* new IssueNotFoundError({ number: proposal.number });
      if (baseChanged(proposal.base, current)) {
        return yield* new IssueChangedError({ number: proposal.number });
      }
      const withImages =
        images.length === 0
          ? { ...proposal, images }
          : yield* attachImages({ ...proposal, images }, repository, proposal.number);
      yield* giteaOutbound.updateIssue(repository, proposal.number, {
        title: text.success.title,
        body: bodyWithImages(text.success.body, withImages.attached, images),
      });
      yield* Effect.logInfo('Issue updated').pipe(
        Effect.annotateLogs({ project: proposal.project, number: proposal.number }),
      );
      return {
        ...withImages,
        ...text.success,
        // Only the images of this decision went along; earlier tries may have attached others.
        attached: withImages.attached.filter((image) => images.includes(image.image)),
        state: { _tag: 'updated', url: current.url },
      } satisfies EditProposal;
    });

  /** The decided proposal, or why the decision does not fit it. */
  const decided = (proposal: ProposalEntry, decision: ProposalDecisionInput) => {
    if (proposal.kind === 'edit') {
      if (decision._tag === 'Discard') return Effect.succeed(discarded(proposal));
      return decision._tag === 'Apply'
        ? applyEdit(proposal, decision, decision.images)
        : Effect.fail(mismatch(proposal));
    }
    const { state } = proposal;
    if (state._tag === 'attaching') {
      if (decision._tag === 'Create') return finishImages(proposal, state);
      return decision._tag === 'FinishWithout'
        ? Effect.flatMap(repositoryOf(proposal.project), (repository) =>
            linkImages(proposal, repository, state),
          )
        : Effect.fail(mismatch(proposal));
    }
    if (decision._tag === 'Discard') return Effect.succeed(discarded(proposal));
    return decision._tag === 'Create'
      ? createIssue(proposal, decision.issue, decision.images)
      : Effect.fail(mismatch(proposal));
  };

  const state = currentState;

  const events = (after: number): Stream.Stream<BrainstormEventDto> => feed.follow(FEED, after);

  /** The kept images of these ids, in order; an id the store does not know is refused. */
  const readImages = Effect.fnUntraced(function* (ids: ReadonlyArray<string>) {
    const parsed = yield* Effect.fromResult(parseImageIds(ids));
    const images: Array<StoredImage> = [];
    for (const id of parsed) {
      const image = yield* imagesOutbound.read(id);
      if (Option.isNone(image)) {
        return yield* new InvalidInputError({
          issues: [{ field: 'imageIds', message: `${id} is not an attached image.` }],
        });
      }
      images.push(image.value);
    }
    return images;
  });

  const send = Effect.fn('Brainstorm.send')(function* (
    text: string,
    imageIds: ReadonlyArray<string> = [],
  ) {
    yield* ensureSetUp;
    // A message of images alone needs no text (spec 023, requirement 2).
    const parsed =
      imageIds.length > 0 && text.trim() === '' ? Result.succeed('') : parsePrompt(text);
    if (Result.isFailure(parsed)) return yield* parsed.failure;
    const images = yield* readImages(imageIds);
    yield* ensureIdle;
    const first = brainstormImages(ownEntries(ongoing)).length + 1;
    answering = true;
    yield* recordIn(ongoing.id, (at) => ({
      kind: 'said',
      id: newId(),
      at,
      text: parsed.success,
      images: imageIds,
    }));
    const note = imagesNote(
      imageIds.map((_, index) => first + index),
      runtime.seesImages ?? false,
    );
    yield* startTurn(
      [parsed.success, note].filter((part) => part !== '').join('\n\n'),
      runtime.seesImages === true ? images : [],
    );
  }, lock.withPermits(1));

  const decide = Effect.fn('Brainstorm.decide')(function* (
    id: string,
    decision: ProposalDecisionInput,
  ) {
    yield* ensureSetUp;
    yield* ensureIdle;
    const proposal = proposalOf(ownEntries(ongoing), id);
    if (proposal === undefined) return yield* new ProposalNotFoundError({ id });
    if (proposal.state._tag !== 'open' && proposal.state._tag !== 'attaching') {
      return yield* new ProposalDecidedError({ id });
    }
    const settled = yield* decided(proposal, decision);
    answering = true;
    yield* change({
      ...ongoing,
      // Pi's next edit of the issue starts from the version the owner just saved.
      reads:
        settled.kind === 'edit' && settled.state._tag === 'updated'
          ? rememberRead(ongoing.reads, {
              project: settled.project,
              number: settled.number,
              url: settled.url,
              title: settled.title,
              body: settled.body,
              cut: false,
            })
          : ongoing.reads,
    });
    yield* saveProposal(settled);
    yield* startTurn(decisionNote(settled, numbersOf(ownEntries(ongoing))));
  }, lock.withPermits(1));

  const reset = Effect.fn('Brainstorm.reset')(function* () {
    // The stopped turn records its stop, and its running tools with it, before the brainstorm goes.
    yield* engine.stop(ongoing.id);
    answering = false;
    ongoing = emptyBrainstorm();
    yield* feed.record(FEED, { kind: 'brainstormStarted' });
  }, lock.withPermits(1));

  return { state, events, send, decide, reset };
});
