import { describe, expect, it } from '@effect/vitest';
import {
  InvalidInputError,
  MAX_ATTACHED_PULL_REQUESTS,
  PullRequestListFullError,
} from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { TestClock } from 'effect/testing';
import {
  AgentNotFoundError,
  InvalidPullRequestError,
  NoConversationError,
  PullRequestNotFoundError,
  PullRequestsStoreError,
} from '../errors.js';
import { PullRequestsInbound } from '../ports/pull-requests.inbound.port.js';
import { fakeAgent, fakeLayer, FakeState, pullRequestKey } from '../testing/fakes.js';

const layer = () => PullRequestsInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const pr = (number: number, name = 'app') => ({ owner: 'owner', name, number });
const url = (number: number, name = 'app') => `http://gitea.test/owner/${name}/pulls/${number}`;

const DIFF = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
`;

/** A Claude agent `kirk` with a session, and pull requests 7 (open) and 8 (merged) on Gitea. */
const arrange = Effect.gen(function* () {
  const state = yield* FakeState;
  state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 'session-1' })];
  state.pullRequests.set(pullRequestKey(pr(7)), {
    title: 'feat: dark mode',
    state: 'open',
    url: url(7),
    diff: DIFF,
    files: [],
  });
  state.pullRequests.set(pullRequestKey(pr(8)), {
    title: 'fix: contrast',
    state: 'merged',
    url: url(8),
    diff: undefined,
    files: [
      {
        path: 'a.ts',
        kind: 'modified',
        additions: 1,
        deletions: 1,
        shown: { kind: 'too-large' },
      },
    ],
  });
  return state;
});

const attach = (ref: string, input: Parameters<PullRequestsInbound['Service']['attach']>[1]) =>
  PullRequestsInbound.use((inbound) => inbound.attach(ref, input));

describe('PullRequestsInbound.attach', () => {
  it.effect('attaches a pull request by its page and answers it as Gitea has it', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      yield* TestClock.setTime(1_000);

      const attached = yield* attach('kirk', { url: url(7) });

      expect(attached).toEqual({
        owner: 'owner',
        name: 'app',
        number: 7,
        url: url(7),
        title: 'feat: dark mode',
        state: 'open',
      });
      expect(state.attachedLists).toEqual({
        'session-1': [{ ...pr(7), url: url(7), attachedAt: 1_000 }],
      });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('attaches by repository and number, and by the pane id', () =>
    Effect.gen(function* () {
      const state = yield* arrange;

      yield* attach('w1:p1', { repository: 'owner/app', number: 8 });

      expect(state.attachedLists['session-1']?.map((entry) => entry.number)).toEqual([8]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('adds to the list, and attaching one again changes nothing', () =>
    Effect.gen(function* () {
      const state = yield* arrange;

      yield* attach('kirk', { url: url(7) });
      yield* attach('kirk', { url: url(8) });
      const again = yield* attach('kirk', { repository: 'owner/app', number: 7 });

      expect(again.number).toBe(7);
      expect(state.attachedLists['session-1']?.map((entry) => entry.number)).toEqual([7, 8]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('keeps the lists of other agents', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      state.attachedLists = { other: [{ ...pr(1), url: url(1), attachedAt: 0 }] };

      yield* attach('kirk', { url: url(7) });

      expect(Object.keys(state.attachedLists).sort()).toEqual(['other', 'session-1']);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses a page on another host, an issue, and a broken repository', () =>
    Effect.gen(function* () {
      const state = yield* arrange;

      const other = yield* attach('kirk', { url: 'https://github.com/a/b/pull/1' }).pipe(
        Effect.flip,
      );
      const issue = yield* attach('kirk', { url: 'http://gitea.test/owner/app/issues/7' }).pipe(
        Effect.flip,
      );
      const broken = yield* attach('kirk', { repository: 'app', number: 7 }).pipe(Effect.flip);

      expect(other).toEqual(
        new InvalidPullRequestError({
          reason: "Only pull requests on this app's Gitea can be attached.",
        }),
      );
      expect(issue).toEqual(
        new InvalidPullRequestError({
          reason:
            'This is not the address of a pull request, such as <gitea>/<owner>/<repo>/pulls/<number>.',
        }),
      );
      expect(broken).toBeInstanceOf(InvalidInputError);
      expect(state.attachedLists).toEqual({});
      expect(state.giteaCalls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses a pull request Gitea does not have', () =>
    Effect.gen(function* () {
      const state = yield* arrange;

      const error = yield* attach('kirk', { url: url(9) }).pipe(Effect.flip);

      expect(error).toEqual(new PullRequestNotFoundError(pr(9)));
      expect(state.attachedLists).toEqual({});
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses an agent without a session, and an unknown agent', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      state.agents = [...state.agents, fakeAgent({ paneId: 'w1:p2', name: 'bones', kind: 'bash' })];

      const none = yield* attach('bones', { url: url(7) }).pipe(Effect.flip);
      const unknown = yield* attach('spock', { url: url(7) }).pipe(Effect.flip);

      expect(none).toEqual(new NoConversationError({ ref: 'bones' }));
      expect(unknown).toEqual(new AgentNotFoundError({ ref: 'spock' }));
      expect(state.attachedLists).toEqual({});
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses one more than the limit', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      const full = Array.from({ length: MAX_ATTACHED_PULL_REQUESTS }, (_, index) => ({
        ...pr(100 + index),
        url: url(100 + index),
        attachedAt: 0,
      }));
      state.attachedLists = { 'session-1': full };

      const error = yield* attach('kirk', { url: url(7) }).pipe(Effect.flip);

      expect(error).toEqual(new PullRequestListFullError({ limit: MAX_ATTACHED_PULL_REQUESTS }));
      expect(state.attachedLists['session-1']).toBe(full);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('keeps a broken file as it is', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      state.attachedListsFailure = 'pull-requests.json is not readable';

      const error = yield* attach('kirk', { url: url(7) }).pipe(Effect.flip);

      expect(error).toEqual(
        new PullRequestsStoreError({ reason: 'pull-requests.json is not readable' }),
      );
    }).pipe(Effect.provide(layer())),
  );

  it.effect('attaches two at once without losing one', () =>
    Effect.gen(function* () {
      const state = yield* arrange;

      yield* Effect.all([attach('kirk', { url: url(7) }), attach('kirk', { url: url(8) })], {
        concurrency: 'unbounded',
      });

      expect(state.attachedLists['session-1']).toHaveLength(2);
    }).pipe(Effect.provide(layer())),
  );
});

describe('PullRequestsInbound.list', () => {
  it.effect('answers the attached pull requests in their order, as Gitea has them now', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      yield* attach('kirk', { url: url(8) });
      yield* attach('kirk', { url: url(7) });
      state.pullRequests.set(pullRequestKey(pr(7)), {
        title: 'feat: dark mode, renamed',
        state: 'open',
        url: url(7),
        diff: DIFF,
        files: [],
      });

      const list = yield* PullRequestsInbound.use((inbound) => inbound.list('kirk'));

      expect(list.map((entry) => [entry.number, entry.title, entry.state])).toEqual([
        [8, 'fix: contrast', 'merged'],
        [7, 'feat: dark mode, renamed', 'open'],
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('says why one is unavailable now and keeps the others', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      yield* attach('kirk', { url: url(7) });
      yield* attach('kirk', { url: url(8) });
      state.pullRequests.delete(pullRequestKey(pr(7)));

      const list = yield* PullRequestsInbound.use((inbound) => inbound.list('kirk'));

      expect(list[0]).toEqual({
        owner: 'owner',
        name: 'app',
        number: 7,
        url: url(7),
        unavailable: 'Gitea has no such pull request now, or the token cannot read it.',
      });
      expect(list[1]?.state).toBe('merged');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('says Gitea is unreachable on each of them', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      yield* attach('kirk', { url: url(7) });
      state.giteaFailure = 'Gitea cannot be reached.';

      const list = yield* PullRequestsInbound.use((inbound) => inbound.list('kirk'));

      expect(list[0]?.unavailable).toBe('Gitea cannot be reached.');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('answers none for an agent without a session or without pull requests', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      state.agents = [...state.agents, fakeAgent({ paneId: 'w1:p2', name: 'bones', kind: 'bash' })];

      expect(yield* PullRequestsInbound.use((inbound) => inbound.list('bones'))).toEqual([]);
      expect(yield* PullRequestsInbound.use((inbound) => inbound.list('kirk'))).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );
});

describe('PullRequestsInbound.remove', () => {
  it.effect('removes one and keeps the rest; one that is not there changes nothing', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      yield* attach('kirk', { url: url(7) });
      yield* attach('kirk', { url: url(8) });

      yield* PullRequestsInbound.use((inbound) => inbound.remove('kirk', pr(7)));
      yield* PullRequestsInbound.use((inbound) => inbound.remove('kirk', pr(99)));

      expect(state.attachedLists['session-1']?.map((entry) => entry.number)).toEqual([8]);
      expect(state.giteaCalls.filter((call) => !call.startsWith('pullRequest '))).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );
});

describe('PullRequestsInbound.changes', () => {
  it.effect("answers an attached pull request's files with their lines", () =>
    Effect.gen(function* () {
      yield* arrange;
      yield* attach('kirk', { url: url(7) });

      const changes = yield* PullRequestsInbound.use((inbound) => inbound.changes('kirk', pr(7)));

      expect(changes.tooLarge).toBe(false);
      expect(changes.pullRequest.title).toBe('feat: dark mode');
      expect(changes.files).toEqual([
        {
          path: 'a.ts',
          kind: 'modified',
          additions: 1,
          deletions: 1,
          shown: {
            kind: 'hunks',
            hunks: [
              {
                header: '@@ -1 +1 @@',
                lines: [
                  { kind: 'removed', text: 'old', old: 1 },
                  { kind: 'added', text: 'new', new: 1 },
                ],
              },
            ],
          },
        },
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('answers the file list when the diff is too large', () =>
    Effect.gen(function* () {
      const state = yield* arrange;
      yield* attach('kirk', { url: url(8) });

      const changes = yield* PullRequestsInbound.use((inbound) => inbound.changes('kirk', pr(8)));

      expect(changes.tooLarge).toBe(true);
      expect(changes.files.map((file) => file.path)).toEqual(['a.ts']);
      expect(state.giteaCalls).toContain('pullRequestFiles owner/app#8');
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses a pull request the agent has not attached, without asking Gitea', () =>
    Effect.gen(function* () {
      const state = yield* arrange;

      const error = yield* PullRequestsInbound.use((inbound) =>
        inbound.changes('kirk', pr(7)),
      ).pipe(Effect.flip);

      expect(error).toEqual(new PullRequestNotFoundError(pr(7)));
      expect(state.giteaCalls).toEqual([]);
    }).pipe(Effect.provide(layer())),
  );
});
