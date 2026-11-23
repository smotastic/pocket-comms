import type { ChangedFile, PullRequestState } from '@pocket-comms/comms-domain';

/**
 * A pull request attached to an agent. Its title and state are read from Gitea at the time; when
 * Gitea cannot read it now, `unavailable` says why and the two are absent.
 */
export interface AttachedPullRequestDto {
  readonly owner: string;
  readonly name: string;
  readonly number: number;
  readonly url: string;
  readonly title?: string;
  readonly state?: PullRequestState;
  readonly unavailable?: string;
}

/** What attaches a pull request: its page, or its repository (`owner/name`) and number. */
export type AttachPullRequestInput =
  | { readonly url: string }
  | { readonly repository: string; readonly number: number };

/** A pull request's changed files; `tooLarge` when its diff was too large and they have no lines. */
export interface PullRequestChangesDto {
  readonly pullRequest: AttachedPullRequestDto;
  readonly tooLarge: boolean;
  readonly files: ReadonlyArray<ChangedFile>;
}
