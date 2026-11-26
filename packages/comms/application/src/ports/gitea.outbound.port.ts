import type {
  CiRun,
  ChangedFile,
  GiteaRepository,
  ImageKind,
  Issue,
  IssueText,
  PullRequestRef,
  PullRequestState,
} from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type {
  GiteaNotConfiguredError,
  GiteaUnavailableError,
  IssueNotFoundError,
  PullRequestNotFoundError,
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

/** A image to attach to an issue, with the file name Gitea shows. */
export interface IssueImage {
  readonly name: string;
  readonly kind: ImageKind;
  readonly bytes: Uint8Array;
}

/** What an address names: a pull request on this Gitea, a page on another host, or neither. */
export type PullRequestAddress =
  | { readonly _tag: 'PullRequest'; readonly ref: PullRequestRef }
  | { readonly _tag: 'OtherHost' }
  | { readonly _tag: 'NotAPullRequest' };

/** A pull request as Gitea has it now. */
export interface PullRequestInfo {
  readonly title: string;
  readonly state: PullRequestState;
  /** Its page in Gitea. */
  readonly url: string;
}

/**
 * The app's Gitea server. It reads issues, closes them, creates them, marks them in progress,
 * changes their title and body and attaches images to them; no other method writes.
 */
export class GiteaOutbound extends Context.Service<
  GiteaOutbound,
  {
    /** The repository a git remote URL names, when the remote is this Gitea. */
    readonly repositoryOf: (remoteUrl: string) => Option.Option<LinkedRepository>;
    /** The repository's default branch; none when Gitea has no such repository for the token. */
    readonly defaultBranch: (
      repository: GiteaRepository,
    ) => Effect.Effect<Option.Option<string>, Failure>;
    /** The text of the file at `path` on `ref`; none when there is no such file. */
    readonly fileText: (
      repository: GiteaRepository,
      ref: string,
      path: string,
    ) => Effect.Effect<Option.Option<string>, Failure>;
    /**
     * The names in the folder at `path` on `ref`; a file alone names itself, and a missing path
     * names nothing.
     */
    readonly entryNames: (
      repository: GiteaRepository,
      ref: string,
      path: string,
    ) => Effect.Effect<ReadonlyArray<string>, Failure>;
    /**
     * The runs of CI for a push to `branch`, newest first, up to 20; none when Gitea does not
     * list them (no Actions, or no such repository).
     */
    readonly pushRuns: (
      repository: GiteaRepository,
      branch: string,
    ) => Effect.Effect<Option.Option<ReadonlyArray<CiRun>>, Failure>;
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
    /** The pull request an address names, when the address is a pull request page of this Gitea. */
    readonly pullRequestOf: (address: string) => PullRequestAddress;
    readonly pullRequest: (
      ref: PullRequestRef,
    ) => Effect.Effect<PullRequestInfo, Failure | PullRequestNotFoundError>;
    /** The pull request's unified diff, or none when it is longer than `maxBytes`. */
    readonly pullRequestDiff: (
      ref: PullRequestRef,
      maxBytes: number,
    ) => Effect.Effect<Option.Option<string>, Failure | PullRequestNotFoundError>;
    /** The pull request's changed files with their counts and no lines, in Gitea's order. */
    readonly pullRequestFiles: (
      ref: PullRequestRef,
    ) => Effect.Effect<ReadonlyArray<ChangedFile>, Failure | PullRequestNotFoundError>;
    /** Uploads the image as an attachment of the issue and answers its link in Gitea. */
    readonly attachImage: (
      repository: GiteaRepository,
      number: number,
      image: IssueImage,
    ) => Effect.Effect<string, Failure | IssueNotFoundError>;
  }
>()('comms/application/GiteaOutbound') {}
