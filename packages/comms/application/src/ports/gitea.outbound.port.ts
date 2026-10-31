import type { GiteaRepository, Issue } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type {
  GiteaNotConfiguredError,
  GiteaUnavailableError,
  IssueNotFoundError,
} from '../errors.js';

/** A repository on the app's Gitea, with its page there. */
export interface LinkedRepository extends GiteaRepository {
  readonly url: string;
}

type Failure = GiteaNotConfiguredError | GiteaUnavailableError;

/** The app's Gitea server, read only: the port has no method that writes. */
export class GiteaOutbound extends Context.Service<
  GiteaOutbound,
  {
    /** The repository a git remote URL names, when the remote is this Gitea. */
    readonly repositoryOf: (remoteUrl: string) => Option.Option<LinkedRepository>;
    /** The open issues and pull requests, in Gitea's order, up to 500. */
    readonly openIssues: (
      repository: GiteaRepository,
    ) => Effect.Effect<ReadonlyArray<Issue>, Failure>;
    readonly issue: (
      repository: GiteaRepository,
      number: number,
    ) => Effect.Effect<Issue, Failure | IssueNotFoundError>;
  }
>()('comms/application/GiteaOutbound') {}
