import type { AttachedPullRequestRef } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type { PullRequestsStoreError } from '../errors.js';

/** Every agent's attached pull requests, by the session id of the agent's conversation. */
export type AttachedLists = Readonly<Record<string, ReadonlyArray<AttachedPullRequestRef>>>;

/** The agents' attached pull requests, kept across restarts (spec 031); none until the first attach. */
export class PullRequestsOutbound extends Context.Service<
  PullRequestsOutbound,
  {
    readonly load: Effect.Effect<AttachedLists, PullRequestsStoreError>;
    /** Keeps `lists` in place of the saved ones. */
    readonly save: (lists: AttachedLists) => Effect.Effect<void, PullRequestsStoreError>;
  }
>()('comms/application/PullRequestsOutbound') {}
