import type { AgentStatus } from '@pocket-comms/comms-domain';
import type { TaskCreatedDto } from './task.dto.js';

/** A live agent in an issue's worktree. */
export interface IssueAgentDto {
  readonly ref: string;
  readonly status: AgentStatus;
}

/** A worktree on an issue's branch and its live agents. */
export interface IssueWorkDto {
  readonly branch: string;
  readonly agents: ReadonlyArray<IssueAgentDto>;
}

/** An open issue as the project screen shows it. */
export interface IssueDto {
  readonly number: number;
  readonly title: string;
  readonly labels: ReadonlyArray<string>;
  readonly updatedAt: number;
  readonly url: string;
  /** The branch the issue suggests for its worktree. */
  readonly branch: string;
  readonly work: ReadonlyArray<IssueWorkDto>;
  /** It has the in-progress label or a worktree on it (spec 015). */
  readonly inProgress: boolean;
}

/** A project's issues, or why the project has none to show. */
export type IssueListDto =
  | {
      readonly _tag: 'Listed';
      readonly repository: { readonly owner: string; readonly name: string; readonly url: string };
      readonly issues: ReadonlyArray<IssueDto>;
    }
  | { readonly _tag: 'NoGiteaRemote' }
  | { readonly _tag: 'NotConfigured' };

/** Close an issue of a project. */
export interface CloseIssueInput {
  readonly project: string;
  readonly number: number;
}

/** The task an issue started; `markNote` says why the issue was not marked in progress. */
export interface IssueTaskCreatedDto extends TaskCreatedDto {
  readonly markNote: string | undefined;
}

/** Implement an issue of a project on a new branch. */
export interface ImplementIssueInput {
  readonly project: string;
  readonly number: number;
  readonly branch: string;
}
