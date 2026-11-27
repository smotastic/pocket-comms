import type { BotFacts, GiteaRepository, Lane } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type { MissionBotError } from '../errors.js';

/**
 * The mission bot (spec 035, ADR 0019): the Gitea user missions act as, with its own token. It
 * writes only the records a mission leaves on an issue, and the git identity of a mission's
 * worktree. Without a token every write fails with that reason.
 */
export class MissionBotOutbound extends Context.Service<
  MissionBotOutbound,
  {
    /** Whether the server has the bot's token. */
    readonly configured: boolean;
    /**
     * The Claude settings of a mission's agent, passed with `--settings`: auto mode and the deny
     * list that ship with the server (ADR 0019).
     */
    readonly settingsPath: string;
    /**
     * Whether the bot may push to the repository and write its issues; it never fails, a failure
     * is a fact too.
     */
    readonly facts: (repository: GiteaRepository) => Effect.Effect<BotFacts>;
    /** Sets the lane's label on the issue, creating it when missing, and removes the other lane's. */
    readonly setLane: (
      repository: GiteaRepository,
      number: number,
      lane: Lane,
    ) => Effect.Effect<void, MissionBotError>;
    /** Adds the in-progress label to the issue, creating it when missing. */
    readonly markInProgress: (
      repository: GiteaRepository,
      number: number,
    ) => Effect.Effect<void, MissionBotError>;
    /** Removes the in-progress label from the issue, when it has it. */
    readonly unmarkInProgress: (
      repository: GiteaRepository,
      number: number,
    ) => Effect.Effect<void, MissionBotError>;
    readonly comment: (
      repository: GiteaRepository,
      number: number,
      body: string,
    ) => Effect.Effect<void, MissionBotError>;
    /**
     * Makes git in the worktree at `path`, and only there, commit as the bot and push to the
     * repository over HTTP with the bot's token.
     */
    readonly prepareWorktree: (
      path: string,
      repository: GiteaRepository,
    ) => Effect.Effect<void, MissionBotError>;
    /** Pushes the tag `tag` on the commit `target`; an existing tag on it is fine (spec 036). */
    readonly pushTag: (
      repository: GiteaRepository,
      tag: string,
      target: string,
    ) => Effect.Effect<void, MissionBotError>;
    /** Opens an issue and answers its number (spec 036). */
    readonly openIssue: (
      repository: GiteaRepository,
      issue: { readonly title: string; readonly body: string },
    ) => Effect.Effect<number, MissionBotError>;
    /**
     * Adds the label `add` to the issue, created with `style` when the repository has none, and
     * removes the labels named in `remove` that it has (spec 038).
     */
    readonly relabel: (
      repository: GiteaRepository,
      number: number,
      add: string,
      style: { readonly color: string; readonly description: string },
      remove: ReadonlyArray<string>,
    ) => Effect.Effect<void, MissionBotError>;
    /** Closes an issue with a comment first (spec 037). */
    readonly closeIssue: (
      repository: GiteaRepository,
      number: number,
      comment: string,
    ) => Effect.Effect<void, MissionBotError>;
  }
>()('comms/application/MissionBotOutbound') {}
