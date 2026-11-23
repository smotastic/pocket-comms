import {
  attachTo,
  MAX_DIFF_BYTES,
  parseRepositoryName,
  parseUnifiedDiff,
  samePullRequest,
  type AttachedPullRequestRef,
  type PullRequestRef,
} from '@pocket-comms/comms-domain';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Semaphore from 'effect/Semaphore';
import type {
  AttachedPullRequestDto,
  AttachPullRequestInput,
  PullRequestChangesDto,
} from '../dto/pull-request.dto.js';
import {
  InvalidPullRequestError,
  NoConversationError,
  PullRequestNotFoundError,
} from '../errors.js';
import { GiteaOutbound, type PullRequestInfo } from '../ports/gitea.outbound.port.js';
import { PullRequestsOutbound } from '../ports/pull-requests.outbound.port.js';
import { makeLoadAgents } from './agents.js';

// The pull requests an agent attaches to its conversation (spec 031). The list is kept by the
// session id of the agent's conversation; title and state are read from Gitea each time, so they
// are never stale.

const OTHER_HOST = "Only pull requests on this app's Gitea can be attached.";
const NOT_A_PULL_REQUEST =
  'This is not the address of a pull request, such as <gitea>/<owner>/<repo>/pulls/<number>.';

/** How many pull requests of one list are read from Gitea at once. */
const READ_CONCURRENCY = 4;

const plain = ({ owner, name, number }: PullRequestRef): PullRequestRef => ({
  owner,
  name,
  number,
});

const viewOf = (
  attached: AttachedPullRequestRef,
  info: PullRequestInfo,
): AttachedPullRequestDto => ({
  ...plain(attached),
  url: info.url,
  title: info.title,
  state: info.state,
});

export const makePullRequests = Effect.gen(function* () {
  const { find } = yield* makeLoadAgents;
  const giteaOutbound = yield* GiteaOutbound;
  const store = yield* PullRequestsOutbound;
  // One change of the file at a time, so two attaches never lose one another.
  const writing = yield* Semaphore.make(1);

  /** The session of the agent's conversation, if it has one. */
  const sessionOf = Effect.fn('PullRequests.sessionOf')(function* (ref: string) {
    const { agent } = yield* find(ref);
    return Option.fromNullishOr(agent.session);
  });

  const listOf = (session: string) =>
    store.load.pipe(Effect.map((lists) => ({ lists, list: lists[session] ?? [] })));

  const refOf = Effect.fn('PullRequests.refOf')(function* (input: AttachPullRequestInput) {
    if ('url' in input) {
      const address = giteaOutbound.pullRequestOf(input.url.trim());
      if (address._tag === 'OtherHost') {
        return yield* new InvalidPullRequestError({ reason: OTHER_HOST });
      }
      if (address._tag === 'NotAPullRequest') {
        return yield* new InvalidPullRequestError({ reason: NOT_A_PULL_REQUEST });
      }
      return address.ref;
    }
    const repository = yield* Effect.fromResult(parseRepositoryName(input.repository.trim()));
    return { ...repository, number: input.number };
  });

  const attach = Effect.fn('PullRequests.attach')(function* (
    ref: string,
    input: AttachPullRequestInput,
  ) {
    const session = yield* sessionOf(ref);
    if (Option.isNone(session)) return yield* new NoConversationError({ ref });
    const pullRequest = yield* refOf(input);
    const info = yield* giteaOutbound.pullRequest(pullRequest);
    const now = yield* Clock.currentTimeMillis;
    const entry: AttachedPullRequestRef = { ...plain(pullRequest), url: info.url, attachedAt: now };
    yield* writing.withPermits(1)(
      Effect.gen(function* () {
        const { lists, list } = yield* listOf(session.value);
        const next = yield* Effect.fromResult(attachTo(list, entry));
        if (next !== list) yield* store.save({ ...lists, [session.value]: next });
      }),
    );
    return viewOf(entry, info);
  });

  const unavailable = (attached: AttachedPullRequestRef) => (reason: string) =>
    Effect.succeed<AttachedPullRequestDto>({
      ...plain(attached),
      url: attached.url,
      unavailable: reason,
    });

  const list = Effect.fn('PullRequests.list')(function* (ref: string) {
    const session = yield* sessionOf(ref);
    if (Option.isNone(session)) return [];
    const { list: attached } = yield* listOf(session.value);
    return yield* Effect.forEach(
      attached,
      (entry) =>
        giteaOutbound.pullRequest(entry).pipe(
          Effect.map((info) => viewOf(entry, info)),
          Effect.catchTags({
            PullRequestNotFoundError: () =>
              unavailable(entry)(
                'Gitea has no such pull request now, or the token cannot read it.',
              ),
            GiteaNotConfiguredError: () => unavailable(entry)('Gitea is not set up.'),
            GiteaUnavailableError: (error) => unavailable(entry)(error.reason),
          }),
        ),
      { concurrency: READ_CONCURRENCY },
    );
  });

  const remove = Effect.fn('PullRequests.remove')(function* (
    ref: string,
    pullRequest: PullRequestRef,
  ) {
    const session = yield* sessionOf(ref);
    if (Option.isNone(session)) return;
    yield* writing.withPermits(1)(
      Effect.gen(function* () {
        const { lists, list: attached } = yield* listOf(session.value);
        const next = attached.filter((entry) => !samePullRequest(entry, pullRequest));
        if (next.length !== attached.length) {
          yield* store.save({ ...lists, [session.value]: next });
        }
      }),
    );
  });

  const changes = Effect.fn('PullRequests.changes')(function* (
    ref: string,
    pullRequest: PullRequestRef,
  ) {
    const session = yield* sessionOf(ref);
    const attached = Option.isNone(session)
      ? undefined
      : (yield* listOf(session.value)).list.find((entry) => samePullRequest(entry, pullRequest));
    if (attached === undefined) {
      return yield* new PullRequestNotFoundError(plain(pullRequest));
    }
    const info = yield* giteaOutbound.pullRequest(attached);
    const diff = yield* giteaOutbound.pullRequestDiff(attached, MAX_DIFF_BYTES);
    if (Option.isSome(diff)) {
      return {
        pullRequest: viewOf(attached, info),
        tooLarge: false,
        files: parseUnifiedDiff(diff.value),
      } satisfies PullRequestChangesDto;
    }
    const files = yield* giteaOutbound.pullRequestFiles(attached);
    return {
      pullRequest: viewOf(attached, info),
      tooLarge: true,
      files,
    } satisfies PullRequestChangesDto;
  });

  return { attach, list, remove, changes };
});
