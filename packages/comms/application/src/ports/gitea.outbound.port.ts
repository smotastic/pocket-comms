import type { GiteaRepository, ImageKind, Issue, IssueText } from '@pocket-comms/comms-domain';
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

/** A new issue: its number and its page in Gitea. */
export interface CreatedIssue {
  readonly number: number;
  readonly url: string;
}

/** A picture to attach to an issue, with the file name Gitea shows. */
export interface IssuePicture {
  readonly name: string;
  readonly kind: ImageKind;
  readonly bytes: Uint8Array;
}

/**
 * The app's Gitea server. It reads issues, closes them, creates them, marks them in progress,
 * changes their title and body and attaches pictures to them; no other method writes.
 */
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
    /** Sets the issue's state to closed and changes nothing else. */
    readonly closeIssue: (
      repository: GiteaRepository,
      number: number,
    ) => Effect.Effect<void, Failure | IssueNotFoundError>;
    /**
     * Adds the repository's in-progress label to the issue, creating the label when the
     * repository has none, and keeps the issue's other labels.
     */
    readonly markInProgress: (
      repository: GiteaRepository,
      number: number,
    ) => Effect.Effect<void, Failure | IssueNotFoundError>;
    /** Creates an open issue with exactly this title and body, and nothing else. */
    readonly createIssue: (
      repository: GiteaRepository,
      issue: { readonly title: string; readonly body: string },
    ) => Effect.Effect<CreatedIssue, Failure>;
    /** Sets the issue's title and body to exactly these, and changes nothing else. */
    readonly updateIssue: (
      repository: GiteaRepository,
      number: number,
      text: IssueText,
    ) => Effect.Effect<void, Failure | IssueNotFoundError>;
    /** Uploads the picture as an attachment of the issue and answers its link in Gitea. */
    readonly attachImage: (
      repository: GiteaRepository,
      number: number,
      picture: IssuePicture,
    ) => Effect.Effect<string, Failure | IssueNotFoundError>;
  }
>()('comms/application/GiteaOutbound') {}
