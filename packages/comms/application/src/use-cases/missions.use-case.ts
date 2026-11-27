import {
  agentNameFor,
  awaitingDeploy,
  failureWords,
  isDeployFailure,
  latestTag,
  pausingDeploy,
  planetWaitsForOwner,
  releasePlan,
  releaseSettingsOf,
  type PlannedRelease,
  type ReleaseHistory,
  endComment,
  isNewInLog,
  issueBranch,
  isFinished,
  keptWorktree,
  missionLog,
  missionPrompt,
  missionQueue,
  missionStep,
  newInLog,
  nextMission,
  pruneMissions,
  runningMission,
  sendRefusal,
  startComment,
  updateMission,
  type Lane,
  type Mission,
  type MissionFacts,
  type MissionsFile,
  type MissionWorktree,
  type Repository,
} from '@pocket-comms/comms-domain';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as PubSub from 'effect/PubSub';
import * as Ref from 'effect/Ref';
import * as Semaphore from 'effect/Semaphore';
import * as Stream from 'effect/Stream';
import type { MissionDto, MissionOutcomeInput, MissionsDto } from '../dto/mission.dto.js';
import { MissionNotFoundError, MissionRefusedError, NoGiteaRemoteError } from '../errors.js';
import { DeployOutbound } from '../ports/deploy.outbound.port.js';
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { PushSenderOutbound, PushSubscriptionsOutbound } from '../ports/push.outbound.port.js';
import { MissionBotOutbound } from '../ports/mission-bot.outbound.port.js';
import { MissionsOutbound } from '../ports/missions.outbound.port.js';
import { PlanetsOutbound } from '../ports/planets.outbound.port.js';
import { MultiplexerOutbound, type StartedAgent } from '../ports/multiplexer.outbound.port.js';
import { PullRequestsOutbound, type AttachedLists } from '../ports/pull-requests.outbound.port.js';
import { RepositoriesOutbound } from '../ports/repositories.outbound.port.js';
import { makeAgentLaunch, type StartBase } from './agent-launch.js';
import { makeIssuePlanet } from './issue-planet.js';
import { makePlanets } from './planets.use-case.js';

// Missions (spec 035, ADR 0019): sending an issue on a mission, the mission queue, and the loop
// that starts the next mission and follows the running one from facts to merged. The missions file
// is the only truth; one semaphore orders every change of it, the owner's and the loop's.

/** Claude asks whether to trust every new worktree; the server made it, so it answers yes. */
const TRUST_DIALOG = 'Yes, I trust this folder';
/** The loop runs at most this often on the multiplexer's changes. */
const LOOP_SPACING_MS = 5_000;
/** And at least this often anyway. */
const LOOP_TICK = '30 seconds';
const SETTLE_PAUSE = '500 millis';
const SETTLE_TRIES = 20;

const viewOf = (file: MissionsFile, mission: Mission): MissionDto => ({
  id: mission.id,
  planet: mission.planet,
  issue: mission.issue,
  lane: mission.lane,
  state: mission.state,
  sentAt: mission.sentAt,
  startedAt: mission.startedAt,
  finishedAt: mission.finishedAt,
  agent: mission.agent,
  pullRequest: mission.pullRequest,
  outcome: mission.outcome,
  reason: mission.reason,
  versions: mission.versions,
  output: mission.output,
  fixIssue: mission.fixIssue,
  deployWith: mission.deployWith,
  isNew: isNewInLog(file, mission) ? true : undefined,
});

/** How long a release run may take to appear, and to finish (spec 036, requirement 9). */
const RELEASE_RUN_APPEARS_MS = 10 * 60_000;
const RELEASE_RUN_ENDS_MS = 60 * 60_000;
/**
 * How long a deploy without a known process may take to write its result: a mission saved before
 * spec 037 (spec 036, requirement 14).
 */
const DEPLOY_RESULT_MS = 15 * 60_000;
/** How long a deploy whose process still runs is waited for (spec 037, requirement 1). */
const DEPLOY_RUNNING_MS = 2 * 60 * 60_000;
/** How long a release waits for master's CI on the commit it releases (spec 037, requirement 16). */
const MASTER_CI_MS = 60 * 60_000;

const tagsOf = (releases: ReadonlyArray<PlannedRelease>): string =>
  releases.map((release) => release.tag).join(', ');

const reasonOf = (error: unknown): string =>
  typeof error === 'object' && error !== null
    ? 'reason' in error && typeof error.reason === 'string'
      ? error.reason
      : 'message' in error && typeof error.message === 'string'
        ? error.message
        : '_tag' in error && typeof error._tag === 'string'
          ? error._tag
          : 'It failed.'
    : 'It failed.';

export const makeMissions = Effect.gen(function* () {
  const store = yield* MissionsOutbound;
  const bot = yield* MissionBotOutbound;
  const gitea = yield* GiteaOutbound;
  const repositories = yield* RepositoriesOutbound;
  const multiplexer = yield* MultiplexerOutbound;
  const attached = yield* PullRequestsOutbound;
  const deployer = yield* DeployOutbound;
  const planetsStore = yield* PlanetsOutbound;
  const subscriptions = yield* PushSubscriptionsOutbound;
  const pushSender = yield* PushSenderOutbound;
  const issuePlanet = yield* makeIssuePlanet;
  const planets = yield* makePlanets;
  const { deliver, keep } = yield* makeAgentLaunch;
  const lock = yield* Semaphore.make(1);
  const trigger = yield* PubSub.unbounded<void>();
  const lastRun = yield* Ref.make(0);

  const settings = ['--settings', bot.settingsPath];

  /** Changes the file under the lock, dropping finished missions older than the log keeps. */
  const change = <A, E, R>(
    use: (file: MissionsFile, now: number) => Effect.Effect<readonly [MissionsFile, A], E, R>,
  ) =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const file = yield* store.load;
        const [next, result] = yield* use(file, now);
        if (next !== file) yield* store.save(pruneMissions(next, now));
        return result;
      }),
    );

  const wake = PubSub.publish(trigger, undefined).pipe(Effect.asVoid);

  const planetOf = (mission: Mission) =>
    repositories.list.pipe(
      Effect.map((all) => all.find((repository) => repository.name === mission.planet)),
    );

  /** Leaves a record on the issue; a failure only logs, the mission goes on. */
  const record = (what: string, effect: Effect.Effect<void, { readonly reason: string }>) =>
    effect.pipe(
      Effect.catch((error) =>
        Effect.logWarning(`The mission bot could not ${what}`).pipe(
          Effect.annotateLogs({ reason: error.reason }),
        ),
      ),
    );

  const closeWorkspace = (mission: Mission) =>
    mission.worktree === undefined
      ? Effect.void
      : multiplexer
          .closeWorkspace(mission.worktree.workspaceId)
          .pipe(
            Effect.catch((error) =>
              Effect.logWarning('The workspace of a mission did not close').pipe(
                Effect.annotateLogs({ mission: mission.id, error: error._tag }),
              ),
            ),
          );

  /**
   * What every ending of a running mission does, merged, failed or aborted: its agent stops, and
   * the issue loses the in-progress label. The lane label stays as the record.
   */
  const finish = (mission: Mission) =>
    Effect.gen(function* () {
      yield* closeWorkspace(mission);
      yield* record(
        'remove the in-progress label',
        bot.unmarkInProgress(mission.repository, mission.issue.number),
      );
    });

  /** Ends a running mission without a merge: its worktree and branch stay. */
  const stop = (mission: Mission, state: 'failed' | 'aborted', reason: string, now: number) =>
    Effect.gen(function* () {
      yield* finish(mission);
      yield* record(
        'comment on the issue',
        bot.comment(mission.repository, mission.issue.number, endComment(state, reason)),
      );
      return { ...mission, state, reason, finishedAt: now, agent: undefined } satisfies Mission;
    });

  /** The mission after a merge: its worktree removed unless it has changes. */
  const land = (mission: Mission, now: number) =>
    Effect.gen(function* () {
      yield* finish(mission);
      const planet = yield* planetOf(mission);
      if (planet !== undefined && mission.worktree !== undefined) {
        const path = mission.worktree.path;
        const changed = yield* repositories
          .hasChanges(planet, path)
          .pipe(Effect.orElseSucceed(() => true));
        if (!changed) {
          yield* repositories
            .removeWorktree(planet, path, false)
            .pipe(
              Effect.catch((error) =>
                Effect.logWarning('The worktree of a merged mission stays').pipe(
                  Effect.annotateLogs({ path, reason: error.reason }),
                ),
              ),
            );
        }
      }
      return { ...mission, state: 'merged', finishedAt: now, agent: undefined } satisfies Mission;
    });

  // ---- Release and deploy (spec 036, ADR 0020) ---------------------------------------------

  /** Tells every device of the owner; a device that cannot be reached is skipped. */
  const notify = (mission: Mission, title: string, body: string) =>
    Effect.gen(function* () {
      const devices = yield* subscriptions.list;
      yield* Effect.forEach(
        devices,
        (device) =>
          pushSender.send(device, { title, body, tag: `mission-${mission.id}`, url: '/missions' }),
        { concurrency: 'unbounded', discard: true },
      );
    }).pipe(Effect.catch(() => Effect.logWarning('The owner could not be told about a mission')));

  /** The planet's release plan at the default branch's head, from its AGENTS.md and git. */
  const planReleases = (mission: Mission) =>
    Effect.gen(function* () {
      const planet = yield* planetOf(mission);
      if (planet === undefined) {
        return yield* new MissionRefusedError({ reason: `${mission.planet} is not a planet now.` });
      }
      const branch = yield* gitea.defaultBranch(mission.repository);
      const text = Option.isNone(branch)
        ? Option.none<string>()
        : yield* gitea.fileText(mission.repository, branch.value, 'AGENTS.md');
      const settings = releaseSettingsOf(Option.getOrUndefined(text));
      if (settings._tag === 'Invalid') {
        return { _tag: 'Unsettled', reason: settings.reason } as const;
      }
      // The planet's settings, never its AGENTS.md, decide which apps it may deploy (spec 037).
      const registry = yield* planetsStore.load;
      const allowed = Option.isSome(registry)
        ? (registry.value.planets.find((each) => each.name === mission.planet)?.apps ?? [])
        : [];
      const refused = settings.settings.releases.flatMap((release) =>
        release.app === undefined || allowed.includes(release.app) ? [] : [release.app],
      );
      if (refused.length > 0) {
        return {
          _tag: 'Unsettled',
          reason: refused.map((app) => `${app} is not allowed for ${mission.planet}.`).join(' '),
        } as const;
      }
      const base = yield* repositories.defaultBase(planet);
      yield* repositories.fetchTags(planet);
      const target = yield* repositories.commitOf(planet, base);
      const tags = yield* repositories.tags(planet);
      const histories = yield* Effect.forEach(settings.settings.releases, (release) =>
        Effect.gen(function* () {
          const last = latestTag(release.tag, tags);
          return {
            release,
            last: last?.version,
            commits: yield* repositories.commits(planet, last?.tag, target),
          } satisfies ReleaseHistory;
        }),
      );
      return {
        _tag: 'Planned',
        plan: releasePlan(settings.settings.migrations, histories),
        target,
      } as const;
    });

  /**
   * Starts releasing: master's CI on `target` first (spec 037), then the tags go on `target`, then
   * the release runs, then the deploys.
   */
  const releasing = (
    mission: Mission,
    releases: ReadonlyArray<PlannedRelease>,
    target: string,
    backup: boolean,
    byOwner: boolean,
    now: number,
  ): Mission => ({
    ...mission,
    state: 'releasing',
    finishedAt: undefined,
    reason: undefined,
    deploy: {
      releases,
      step: 0,
      phase: 'ci',
      since: now,
      backup,
      target,
      ...(byOwner ? { byOwner } : {}),
    },
  });

  /**
   * An owner's Deploy that cannot go on waits for the owner again, with why (spec 037,
   * requirement 11); its companions wait on their own.
   */
  const waitAgain = (mission: Mission, reason: string, now: number): Mission => ({
    ...mission,
    state: 'awaiting-deploy',
    reason: `Your Deploy could not go on: ${reason}`,
    finishedAt: now,
    deploy: undefined,
    deployWith: undefined,
  });

  const finished = (
    mission: Mission,
    state: 'not-deployed' | 'nothing-to-release' | 'awaiting-deploy',
    reason: string,
    now: number,
  ): Mission => ({ ...mission, state, reason, finishedAt: now, deploy: undefined });

  /**
   * After the merge (spec 036, requirements 5 to 9): a planet at missions whose deploy checks
   * pass releases; otherwise the mission ends with why.
   */
  const afterMerge = (file: MissionsFile, mission: Mission, now: number) =>
    Effect.gen(function* () {
      const preflight = yield* planets.preflight(mission.planet, true).pipe(Effect.option);
      if (Option.isNone(preflight)) {
        return finished(mission, 'not-deployed', `${mission.planet} is not a planet now.`, now);
      }
      if (preflight.value.autonomy.effective !== 'missions') {
        const failed = preflight.value.checks.filter((check) => !check.passed);
        return finished(
          mission,
          'not-deployed',
          failed.length === 0
            ? `${mission.planet} is not at missions now.`
            : `${mission.planet} is no-go: ${failed.map((check) => check.reason).join(' ')}`,
          now,
        );
      }
      if (!preflight.value.deploy.deploys) {
        const failed = preflight.value.deploy.checks.filter((check) => !check.passed);
        return finished(mission, 'not-deployed', failed[0]?.reason ?? 'It does not deploy.', now);
      }
      if (planetWaitsForOwner(file, mission.planet)) {
        return finished(
          mission,
          'awaiting-deploy',
          `It ships with an earlier change of ${mission.planet} that waits for your Deploy.`,
          now,
        );
      }
      const planned = yield* planReleases(mission).pipe(
        Effect.catch((error) =>
          Effect.succeed({ _tag: 'Unsettled', reason: reasonOf(error) } as const),
        ),
      );
      if (planned._tag === 'Unsettled') {
        return finished(
          mission,
          'not-deployed',
          `The release could not be planned: ${planned.reason}`,
          now,
        );
      }
      switch (planned.plan._tag) {
        case 'Nothing':
          return finished(
            mission,
            'nothing-to-release',
            'No feat, fix or perf commit to release.',
            now,
          );
        case 'Stop':
          return finished(mission, 'awaiting-deploy', planned.plan.reason, now);
        case 'Ship':
          return releasing(mission, planned.plan.releases, planned.target, false, false, now);
      }
    });

  /** The missions that ship with `lead` take its ending (spec 036, requirement 16). */
  const withCompanions = (file: MissionsFile, lead: Mission): MissionsFile => ({
    ...file,
    missions: file.missions.map((mission) =>
      mission.id === lead.id
        ? lead
        : lead.state === 'awaiting-deploy' && mission.deployWith === lead.id
          ? // The lead waits for the owner again: its companions wait on their own (spec 037).
            { ...mission, deployWith: undefined }
          : isFinished(lead) &&
              mission.deployWith === lead.id &&
              mission.state === 'awaiting-deploy'
            ? {
                ...mission,
                state: lead.state,
                finishedAt: lead.finishedAt,
                versions: lead.versions,
                output: lead.output,
                fixIssue: lead.fixIssue,
                reason: `It shipped with #${lead.issue.number}: ${lead.reason ?? lead.state}`,
              }
            : mission,
    ),
  });

  const deployed = (mission: Mission, now: number) =>
    Effect.gen(function* () {
      const releases = mission.deploy?.releases ?? [];
      yield* record(
        'comment on the issue',
        bot.comment(mission.repository, mission.issue.number, `Deployed ${tagsOf(releases)}.`),
      );
      return {
        ...mission,
        state: 'deployed',
        finishedAt: now,
        reason: undefined,
        versions: releases.map((release) => release.tag),
        deploy: undefined,
      } satisfies Mission;
    });

  /** The words of a deploy failure's fix issue. */
  const fixIssueOf = (mission: Mission, releases: ReadonlyArray<string>) => {
    const state =
      mission.state === 'down' || mission.state === 'deploy-lost' || mission.state === 'rolled-back'
        ? mission.state
        : 'failed';
    const words = failureWords(state, mission.planet);
    const output = mission.output;
    return {
      title: `Fix the failed deploy of ${releases.join(', ') || `#${mission.issue.number}`}`,
      body: [
        `Mission Control could not deploy ${releases.join(', ') || 'the release'} after #${mission.issue.number}.`,
        '',
        mission.reason ?? state,
        '',
        words.next,
        ...(output === undefined || output === '' ? [] : ['', '```text', output.trim(), '```']),
        '',
        `The planet is paused until this issue is closed or the owner resumes it. Master is not reverted.`,
      ].join('\n'),
    };
  };

  /** Opens a deploy failure's fix issue; none when Gitea refuses now, and the loop tries again. */
  const openFixIssue = (mission: Mission) =>
    bot.openIssue(mission.repository, fixIssueOf(mission, mission.versions ?? [])).pipe(
      Effect.map((number): number | undefined => number),
      Effect.catch((error) =>
        Effect.as(
          Effect.logWarning('The mission bot could not open the fix issue').pipe(
            Effect.annotateLogs({ reason: error.reason }),
          ),
          undefined,
        ),
      ),
    );

  /**
   * A release or deploy that failed (spec 036, requirements 9 and 12; spec 037): the mission ends
   * with why, the planet is paused, an issue on the planet asks for the fix, and the owner is told.
   */
  const broken = (
    mission: Mission,
    state: 'rolled-back' | 'failed' | 'down' | 'deploy-lost',
    reason: string,
    output: string | undefined,
    now: number,
  ) =>
    Effect.gen(function* () {
      const releases = mission.deploy?.releases ?? [];
      const ended: Mission = {
        ...mission,
        state,
        reason,
        output,
        finishedAt: now,
        versions: releases.map((release) => release.tag),
        deploy: undefined,
      };
      const fixIssue = yield* openFixIssue(ended);
      yield* notify(mission, failureWords(state, mission.planet).title, reason);
      return { ...ended, fixIssue } satisfies Mission;
    });

  /**
   * The paused planets' fix issues that could not be opened, opened now (spec 037, requirement
   * 7). A planet's deploy failure and the missions that shipped with it share one issue.
   */
  const openMissingFixIssues = (file: MissionsFile) =>
    Effect.gen(function* () {
      let next = file;
      for (const planet of new Set(file.missions.map((mission) => mission.planet))) {
        const pausing = pausingDeploy(next, planet);
        if (pausing === undefined || pausing.fixIssue !== undefined) continue;
        const lead = next.missions.find((mission) => mission.id === pausing.deployWith) ?? pausing;
        const number = yield* openFixIssue(lead);
        if (number === undefined) continue;
        next = {
          ...next,
          missions: next.missions.map((mission) =>
            mission.id === lead.id || mission.deployWith === lead.id
              ? { ...mission, fixIssue: number }
              : mission,
          ),
        };
      }
      return next;
    });

  /** One step of a releasing mission: push its tags, then wait for their release runs. */
  const releaseStep = (mission: Mission, now: number) =>
    Effect.gen(function* () {
      let deploy = mission.deploy;
      if (deploy === undefined)
        return yield* broken(mission, 'failed', 'It lost its release.', undefined, now);
      if (deploy.phase === 'ci') {
        // Master's CI on the commit it releases, before any tag (spec 037, requirements 16, 17).
        const status = yield* gitea
          .commitStatus(mission.repository, deploy.target)
          .pipe(Effect.orElseSucceed(() => Option.none()));
        const ci = Option.getOrElse(status, () => 'pending' as const);
        const short = deploy.target.slice(0, 7);
        const stopped =
          ci === 'failure'
            ? `master CI failed on ${short}.`
            : ci === 'pending' && now - deploy.since > MASTER_CI_MS
              ? 'master CI did not finish within 60 minutes.'
              : undefined;
        if (stopped !== undefined) {
          return deploy.byOwner === true
            ? waitAgain(mission, stopped, now)
            : finished(mission, 'not-deployed', stopped, now);
        }
        if (ci === 'pending') return mission;
        deploy = { ...deploy, phase: 'tag', since: now };
      }
      if (deploy.phase === 'tag') {
        for (const release of deploy.releases) {
          const pushed = yield* bot
            .pushTag(mission.repository, release.tag, deploy.target)
            .pipe(Effect.result);
          if (pushed._tag === 'Failure') {
            return yield* broken(
              mission,
              'failed',
              `The tag ${release.tag} could not be pushed: ${pushed.failure.reason}`,
              undefined,
              now,
            );
          }
        }
        return {
          ...mission,
          deploy: { ...deploy, phase: 'build', since: now },
        } satisfies Mission;
      }
      let pending = false;
      for (const release of deploy.releases) {
        if (release.workflow === undefined) continue;
        const run = yield* gitea
          .tagRun(mission.repository, release.workflow, release.tag)
          .pipe(Effect.orElseSucceed(() => Option.none()));
        const waited = now - deploy.since;
        if (Option.isNone(run)) {
          if (waited <= RELEASE_RUN_APPEARS_MS) {
            pending = true;
            continue;
          }
          return yield* broken(
            mission,
            'failed',
            `The release workflow ${release.workflow} of ${release.tag} did not start within 10 minutes.`,
            undefined,
            now,
          );
        }
        if (run.value.status !== 'completed') {
          if (waited <= RELEASE_RUN_ENDS_MS) {
            pending = true;
            continue;
          }
          return yield* broken(
            mission,
            'failed',
            `The release workflow ${release.workflow} of ${release.tag} did not finish within 60 minutes.`,
            undefined,
            now,
          );
        }
        if (run.value.conclusion !== 'success') {
          return yield* broken(
            mission,
            'failed',
            `The release workflow ${release.workflow} of ${release.tag} ended as ${run.value.conclusion ?? 'unknown'}.`,
            undefined,
            now,
          );
        }
      }
      if (pending) return mission;
      const first = deploy.releases.findIndex((release) => release.app !== undefined);
      if (first < 0) return yield* deployed(mission, now);
      return {
        ...mission,
        state: 'deploying',
        deploy: { ...deploy, phase: 'deploy', step: first, since: now, job: undefined },
      } satisfies Mission;
    });

  /** One step of a deploying mission: start the release's deploy, then read its result. */
  const deployStep = (mission: Mission, now: number) =>
    Effect.gen(function* () {
      const deploy = mission.deploy;
      const release = deploy?.releases[deploy.step];
      if (deploy === undefined || release?.app === undefined) {
        return yield* broken(mission, 'failed', 'It lost its deploy.', undefined, now);
      }
      if (deploy.job === undefined) {
        const job = `${mission.id}-${deploy.step}`;
        const started = yield* deployer
          .start({ id: job, app: release.app, version: release.version, backup: deploy.backup })
          .pipe(Effect.result);
        if (started._tag === 'Failure') {
          return yield* broken(mission, 'failed', started.failure.reason, undefined, now);
        }
        return {
          ...mission,
          deploy: { ...deploy, job, pid: started.success.pid, since: now },
        } satisfies Mission;
      }
      const job = deploy.job;
      let result = yield* deployer.result(job);
      if (Option.isNone(result)) {
        const waited = now - deploy.since;
        if (deploy.pid === undefined) {
          // A deploy started before spec 037 has no process to ask.
          return waited <= DEPLOY_RESULT_MS
            ? mission
            : yield* broken(
                mission,
                'deploy-lost',
                `The deploy of ${release.tag} wrote no result within 15 minutes.`,
                undefined,
                now,
              );
        }
        if (yield* deployer.running(deploy.pid)) {
          return waited <= DEPLOY_RUNNING_MS
            ? mission
            : yield* broken(
                mission,
                'deploy-lost',
                `The deploy of ${release.tag} still runs after 2 hours.`,
                undefined,
                now,
              );
        }
        // It ended: a result written right before its end is read once more.
        result = yield* deployer.result(job);
        if (Option.isNone(result)) {
          return yield* broken(
            mission,
            'deploy-lost',
            `The deploy of ${release.tag} ended without a result.`,
            undefined,
            now,
          );
        }
      }
      switch (result.value.result) {
        case 'rolled-back':
          return yield* broken(
            mission,
            'rolled-back',
            `${release.tag} failed its health check and was rolled back.`,
            result.value.output,
            now,
          );
        case 'down':
          return yield* broken(
            mission,
            'down',
            `${release.tag} failed its health check, and the rollback was not healthy either.`,
            result.value.output,
            now,
          );
        case 'failed':
          return yield* broken(
            mission,
            'failed',
            `The deploy of ${release.tag} failed before it deployed anything.`,
            result.value.output,
            now,
          );
        case 'deployed':
          break;
      }
      const next = deploy.releases.findIndex(
        (each, index) => index > deploy.step && each.app !== undefined,
      );
      if (next < 0) return yield* deployed(mission, now);
      return {
        ...mission,
        deploy: { ...deploy, step: next, since: now, job: undefined },
      } satisfies Mission;
    });

  /**
   * The owner's Deploy (spec 036, requirements 15 and 16): the planet's oldest waiting mission
   * joins the queue; the others ship with it. Whether it backs up is planned when it starts.
   */
  const deploy = Effect.fn('Missions.deploy')(function* (id: string) {
    // The planet must be ready to deploy now, or the Deploy is refused and keeps waiting
    // (spec 037, requirement 10).
    const waiting = (yield* store.load).missions.find(
      (each) => each.id === id && each.state === 'awaiting-deploy',
    );
    if (waiting === undefined) return yield* new MissionNotFoundError({ id });
    const preflight = yield* planets
      .preflight(waiting.planet, true)
      .pipe(
        Effect.mapError(
          () => new MissionRefusedError({ reason: `${waiting.planet} is not a planet now.` }),
        ),
      );
    if (preflight.autonomy.effective !== 'missions') {
      const failed = preflight.checks.filter((check) => !check.passed).map((check) => check.reason);
      return yield* new MissionRefusedError({
        reason:
          failed.length === 0
            ? `${waiting.planet} is not at missions.`
            : `${waiting.planet} is no-go: ${failed.join(' ')}`,
      });
    }
    if (!preflight.deploy.deploys) {
      const failed = preflight.deploy.checks.filter((check) => !check.passed);
      return yield* new MissionRefusedError({
        reason: `${waiting.planet} does not deploy: ${failed.map((check) => check.reason).join(' ')}`,
      });
    }
    yield* change((file, now) =>
      Effect.gen(function* () {
        const mission = yield* missionWith(file, id, (each) => each.state === 'awaiting-deploy');
        const [lead, ...others] = awaitingDeploy(file, mission.planet);
        if (lead === undefined) return yield* new MissionNotFoundError({ id });
        const queued: Mission = {
          ...lead,
          state: 'queued',
          sentAt: now,
          finishedAt: undefined,
          reason: undefined,
          deploy: {
            releases: [],
            step: 0,
            phase: 'ci',
            since: now,
            backup: false,
            target: '',
            byOwner: true,
          },
        };
        const companions = new Set(others.map((each) => each.id));
        return [
          {
            ...file,
            missions: file.missions.map((each) =>
              each.id === lead.id
                ? queued
                : companions.has(each.id)
                  ? { ...each, deployWith: lead.id }
                  : each,
            ),
          },
          undefined,
        ] as const;
      }),
    );
    yield* wake;
  });

  /**
   * Starts a queued owner's Deploy: plans the releases and ships them, a stop included. The
   * database is backed up first only when a migration is among them: a breaking change alone needs
   * the owner's attention, not a backup, and a planet without a database has nothing to back up.
   */
  const startOwnerDeploy = (mission: Mission, now: number) =>
    Effect.gen(function* () {
      const planned = yield* planReleases(mission).pipe(
        Effect.catch((error) =>
          Effect.succeed({ _tag: 'Unsettled', reason: reasonOf(error) } as const),
        ),
      );
      if (planned._tag === 'Unsettled') return waitAgain(mission, planned.reason, now);
      if (planned.plan._tag === 'Nothing') {
        return finished(
          mission,
          'nothing-to-release',
          'No feat, fix or perf commit to release.',
          now,
        );
      }
      return {
        ...releasing(
          mission,
          planned.plan.releases,
          planned.target,
          planned.plan._tag === 'Stop' && planned.plan.migration,
          true,
          now,
        ),
        startedAt: now,
      } satisfies Mission;
    });

  // ---- Sending ------------------------------------------------------------------------------

  const send = Effect.fn('Missions.send')(function* (
    planetName: string,
    number: number,
    lane: Lane,
  ) {
    if (!bot.configured) {
      return yield* new MissionRefusedError({
        reason: 'Missions have no bot token (COMMS_MISSION_GITEA_TOKEN).',
      });
    }
    const { planet, repository } = yield* issuePlanet(planetName);
    if (Option.isNone(repository)) return yield* new NoGiteaRemoteError({ planet: planet.name });
    const preflight = yield* planets.preflight(planet.name, true);
    if (preflight.autonomy.effective === 'manual') {
      const failed = preflight.checks.filter((check) => !check.passed).map((check) => check.reason);
      return yield* new MissionRefusedError({
        reason:
          preflight.autonomy.chosen === 'manual'
            ? `${planet.name} is at manual; choose missions on its planet page first.`
            : `${planet.name} is no-go: ${failed.join(' ')}`,
      });
    }
    const issue = yield* gitea.issue(repository.value, number);
    const refusal = sendRefusal(yield* store.load, planet.name, issue);
    if (refusal !== undefined) return yield* new MissionRefusedError({ reason: refusal });
    yield* bot
      .setLane(repository.value, number, lane)
      .pipe(Effect.mapError((error) => new MissionRefusedError({ reason: error.reason })));
    const mission = yield* change((file, now) => {
      const again = sendRefusal(file, planet.name, issue);
      if (again !== undefined) return Effect.fail(new MissionRefusedError({ reason: again }));
      const sent: Mission = {
        id: crypto.randomUUID(),
        planet: planet.name,
        repository: { owner: repository.value.owner, name: repository.value.name },
        issue: { number: issue.number, title: issue.title, url: issue.url },
        lane,
        state: 'queued',
        sentAt: now,
      };
      return Effect.succeed([{ ...file, missions: [...file.missions, sent] }, sent] as const);
    });
    yield* wake;
    return viewOf(yield* store.load, mission);
  });

  // ---- The owner's other requests ----------------------------------------------------------

  const list = Effect.gen(function* () {
    const file = yield* store.load;
    const running = runningMission(file);
    return {
      running: running === undefined ? undefined : viewOf(file, running),
      queue: missionQueue(file).map((mission) => viewOf(file, mission)),
      log: missionLog(file).map((mission) => viewOf(file, mission)),
      newCount: newInLog(file),
    } satisfies MissionsDto;
  }).pipe(Effect.withSpan('Missions.list'));

  const missionWith = (
    file: MissionsFile,
    id: string,
    allowed: (mission: Mission) => boolean,
  ): Effect.Effect<Mission, MissionNotFoundError> => {
    const mission = file.missions.find((each) => each.id === id);
    return mission === undefined || !allowed(mission)
      ? Effect.fail(new MissionNotFoundError({ id }))
      : Effect.succeed(mission);
  };

  const remove = Effect.fn('Missions.remove')(function* (id: string) {
    yield* change((file, now) =>
      missionWith(file, id, (mission) => mission.state === 'queued').pipe(
        Effect.map((mission) =>
          // A queued Deploy of the owner goes back to waiting for it (spec 037, requirement 12).
          mission.deploy?.byOwner === true
            ? ([
                withCompanions(
                  file,
                  waitAgain(mission, 'you took it out of the mission queue.', now),
                ),
                undefined,
              ] as const)
            : ([
                { ...file, missions: file.missions.filter((each) => each.id !== id) },
                undefined,
              ] as const),
        ),
      ),
    );
  });

  /**
   * The owner's Resume of a paused planet (spec 037, requirement 8): its latest deploy failure no
   * longer pauses it, and the bot closes its fix issue.
   */
  const resumePlanet = Effect.fn('Missions.resumePlanet')(function* (planet: string) {
    yield* change((file, now) =>
      Effect.gen(function* () {
        const pausing = pausingDeploy(file, planet);
        if (pausing === undefined) {
          return yield* new MissionRefusedError({ reason: `${planet} is not paused.` });
        }
        const lead = file.missions.find((mission) => mission.id === pausing.deployWith) ?? pausing;
        if (lead.fixIssue !== undefined) {
          yield* record(
            'close the fix issue',
            bot.closeIssue(lead.repository, lead.fixIssue, 'Resumed by the owner.'),
          );
        }
        return [
          {
            ...file,
            missions: file.missions.map((mission) =>
              mission.id === lead.id || mission.deployWith === lead.id
                ? { ...mission, resumedAt: now }
                : mission,
            ),
          },
          undefined,
        ] as const;
      }),
    );
    yield* wake;
  });

  const abort = Effect.fn('Missions.abort')(function* (id: string) {
    yield* change((file, now) =>
      Effect.gen(function* () {
        const mission = yield* missionWith(
          file,
          id,
          // A release or deploy runs on to its result; it has no agent to stop (spec 036).
          (each) =>
            runningMission(file)?.id === each.id &&
            each.state !== 'releasing' &&
            each.state !== 'deploying',
        );
        const stopped = yield* stop(mission, 'aborted', 'The owner aborted it.', now);
        return [updateMission(file, id, () => stopped), undefined] as const;
      }),
    );
    yield* wake;
  });

  const resume = Effect.fn('Missions.resume')(function* (id: string) {
    yield* change((file) =>
      Effect.gen(function* () {
        const mission = yield* missionWith(
          file,
          id,
          (each) =>
            each.state === 'lost' && each.session !== undefined && each.worktree !== undefined,
        );
        const worktree = mission.worktree;
        const session = mission.session;
        const planet = yield* planetOf(mission);
        if (worktree === undefined || session === undefined || planet === undefined) {
          return yield* new MissionNotFoundError({ id });
        }
        const opened = yield* multiplexer.openWorktree({
          cwd: planet.path,
          path: worktree.path,
          label: mission.issue.title,
        });
        const name = mission.agent ?? `mission-${mission.issue.number}`;
        yield* multiplexer.startAgent({
          paneId: opened.paneId,
          name,
          kind: 'claude',
          args: [...settings, '--resume', session],
        });
        return [
          updateMission(file, id, (each) => ({
            ...each,
            state: 'working',
            agent: name,
            reason: undefined,
            worktree: { ...worktree, workspaceId: opened.workspaceId },
          })),
          undefined,
        ] as const;
      }),
    );
  });

  const seen = Effect.fn('Missions.seen')(function* () {
    yield* change((file, now) => Effect.succeed([{ ...file, seenAt: now }, undefined] as const));
  });

  const outcome = Effect.fn('Missions.outcome')(function* (
    agent: string,
    input: MissionOutcomeInput,
  ) {
    const text = input.outcome.trim();
    // The agent names itself by its pane, as the skill sends it, or by its name.
    const live = yield* multiplexer.snapshot.pipe(
      Effect.map((snapshot) =>
        snapshot.agents.find((each) => each.paneId === agent || each.name === agent),
      ),
      Effect.orElseSucceed(() => undefined),
    );
    const name = live?.name ?? agent;
    yield* change((file, now) =>
      Effect.gen(function* () {
        const mission = runningMission(file);
        if (mission === undefined || mission.agent !== name) {
          return yield* new MissionNotFoundError({ id: agent });
        }
        if (input.result === 'failed') {
          const stopped = yield* stop(mission, 'failed', text, now);
          return [
            updateMission(file, mission.id, () => ({ ...stopped, outcome: text })),
            undefined,
          ] as const;
        }
        return [
          updateMission(file, mission.id, (each) => ({ ...each, outcome: text })),
          undefined,
        ] as const;
      }),
    );
    yield* wake;
  });

  // ---- The loop -----------------------------------------------------------------------------

  /** What the server reads about the running mission now. */
  const factsOf = (mission: Mission) =>
    Effect.gen(function* () {
      const snapshot = yield* multiplexer.snapshot;
      const agent = snapshot.agents.find(
        (each) => each.name !== undefined && each.name === mission.agent,
      );
      const session = agent?.session ?? mission.session;
      const lists: AttachedLists = yield* attached.load.pipe(
        Effect.orElseSucceed((): AttachedLists => ({})),
      );
      const ref = (session === undefined ? [] : (lists[session] ?? []))
        .filter(
          (each) =>
            each.owner === mission.repository.owner && each.name === mission.repository.name,
        )
        .at(-1);
      const pullRequest =
        ref === undefined
          ? undefined
          : yield* gitea.pullRequest(ref).pipe(
              Effect.map((info) => ({ number: ref.number, url: info.url, state: info.state })),
              Effect.option,
              Effect.map(Option.getOrUndefined),
            );
      return {
        session,
        facts: {
          agent: agent === undefined ? undefined : { status: agent.status },
          pullRequest:
            pullRequest === undefined
              ? undefined
              : {
                  number: pullRequest.number,
                  url: pullRequest.url,
                  state: pullRequest.state,
                },
        } satisfies MissionFacts,
      };
    });

  /**
   * Starts the mission's Claude in the pane and sends its first prompt once it takes input. Claude
   * asks whether to trust every new worktree; the server made this one, so it answers yes. Any
   * other dialog waits for the owner, and the task start keeps the prompt for them (spec 032).
   */
  const startAgent = Effect.fnUntraced(function* (base: StartBase, paneId: string, prompt: string) {
    const snapshot = yield* multiplexer.snapshot.pipe(Effect.option);
    const taken = new Set(
      Option.isSome(snapshot)
        ? snapshot.value.agents.flatMap((agent) => (agent.name === undefined ? [] : [agent.name]))
        : [],
    );
    const name = agentNameFor(base.branch, taken);
    const start = { ...base, kind: 'claude' as const, prompt, agent: name, reason: undefined };
    yield* keep({ ...start, agent: undefined, delivery: 'pending' });
    const started = yield* multiplexer.startAgent({
      paneId,
      name,
      kind: 'claude',
      args: settings,
    });
    yield* keep({ ...start, delivery: 'pending' });
    const pane = started.paneId;
    let agent: StartedAgent = started;
    let answered = false;
    for (let attempt = 0; attempt <= SETTLE_TRIES; attempt += 1) {
      if (agent.status === 'idle' && agent.ready) {
        yield* deliver({ ...start, delivery: 'pending' }, pane);
        return name;
      }
      if (agent.status === 'blocked' && !answered) {
        const screen = yield* multiplexer.readScreen(pane).pipe(Effect.orElseSucceed(() => ''));
        if (!screen.includes(TRUST_DIALOG)) break;
        yield* multiplexer.sendKeys(pane, ['down', 'enter']);
        answered = true;
      }
      yield* Effect.sleep(SETTLE_PAUSE);
      agent = yield* multiplexer.readAgent(pane).pipe(Effect.orElseSucceed(() => agent));
    }
    yield* keep({
      ...start,
      delivery: 'not-sent',
      reason: 'The mission agent did not take its first prompt; answer it, then send the task.',
    });
    return name;
  });

  /** Starts a queued mission: its worktree as the bot, Claude with the mission settings. */
  const start = (file: MissionsFile, mission: Mission, now: number) => {
    // The worktree once it exists, so a failure after it keeps it for the next send.
    let made: MissionWorktree | undefined;
    return Effect.gen(function* () {
      const preflight = yield* planets.preflight(mission.planet, true);
      if (preflight.autonomy.effective === 'manual') {
        const failed = preflight.checks
          .filter((check) => !check.passed)
          .map((check) => check.reason);
        if (mission.deploy?.byOwner === true) {
          return waitAgain(
            mission,
            preflight.autonomy.chosen === 'manual'
              ? `${mission.planet} is at manual now.`
              : `${mission.planet} is no-go: ${failed.join(' ')}`,
            now,
          );
        }
        return {
          ...mission,
          state: 'held',
          finishedAt: now,
          reason:
            preflight.autonomy.chosen === 'manual'
              ? `${mission.planet} is at manual now.`
              : `${mission.planet} is no-go: ${failed.join(' ')}`,
        } satisfies Mission;
      }
      if (mission.deploy !== undefined) return yield* startOwnerDeploy(mission, now);
      const planet = yield* planetOf(mission);
      if (planet === undefined) {
        return yield* new MissionRefusedError({ reason: `${mission.planet} is not a planet now.` });
      }
      const issue = yield* gitea.issue(mission.repository, mission.issue.number);
      if (issue.state !== 'open') {
        return yield* new MissionRefusedError({ reason: `#${issue.number} is closed now.` });
      }
      const kept = keptWorktree(file, mission);
      const worktree = yield* kept === undefined
        ? addWorktree(planet, issueBranch(issue))
        : Effect.succeed({ path: kept.path, branch: kept.branch });
      made = { ...worktree, workspaceId: worktree.path };
      const opened = yield* multiplexer.openWorktree({
        cwd: planet.path,
        path: worktree.path,
        label: issue.title,
      });
      made = { ...worktree, workspaceId: opened.workspaceId };
      const started = {
        ...mission,
        state: 'working',
        startedAt: now,
        worktree: { ...worktree, workspaceId: opened.workspaceId },
      } satisfies Mission;
      yield* bot.prepareWorktree(worktree.path, mission.repository);
      const prompt = missionPrompt({
        lane: mission.lane,
        issue: { ...issue, url: issue.url },
        repository: mission.repository,
        continued: kept !== undefined,
      });
      const base = {
        folder: worktree.path,
        planet: planet.name,
        branch: worktree.branch,
        issue: issue.number,
      };
      const agent = yield* startAgent(base, opened.paneId, prompt);
      yield* record(
        'mark the issue in progress',
        bot.markInProgress(mission.repository, issue.number),
      );
      yield* record(
        'comment on the issue',
        bot.comment(
          mission.repository,
          issue.number,
          startComment(mission.lane, kept !== undefined),
        ),
      );
      return { ...started, agent } satisfies Mission;
    }).pipe(
      Effect.catch((error) => {
        if (mission.deploy?.byOwner === true) {
          return Effect.succeed(waitAgain(mission, reasonOf(error), now));
        }
        const failed = {
          ...mission,
          state: 'failed',
          finishedAt: now,
          reason: `It did not start: ${reasonOf(error)}`,
          worktree: made,
        } satisfies Mission;
        return Effect.as(closeWorkspace(failed), failed);
      }),
    );
  };

  const addWorktree = (planet: Repository, branch: string) =>
    Effect.gen(function* () {
      const base = yield* repositories.defaultBase(planet);
      if (yield* repositories.branchExists(planet, branch)) {
        return yield* new MissionRefusedError({
          reason: `The branch ${branch} exists already; finish or remove the work on it first.`,
        });
      }
      return yield* repositories.addWorktree(planet, { branch, base });
    });

  /** One step of the loop: follows the running mission, or starts the next one. */
  const advance = change((file, now) =>
    Effect.gen(function* () {
      let next = yield* openMissingFixIssues(file);
      const running = runningMission(next);
      if (running?.state === 'releasing' || running?.state === 'deploying') {
        const moved =
          running.state === 'releasing'
            ? yield* releaseStep(running, now)
            : yield* deployStep(running, now);
        if (moved !== running) next = withCompanions(next, moved);
        // A failed release or deploy pauses the planet; the next mission waits for the saved file,
        // so its preflight sees the pause.
        if (isDeployFailure(moved)) {
          return [next, undefined] as const;
        }
      } else if (running !== undefined && running.state !== 'lost') {
        const { session, facts } = yield* factsOf(running);
        const step = missionStep(running, facts);
        const known = session === running.session ? running : { ...running, session };
        const moved: Mission =
          step._tag === 'Stay'
            ? known
            : step._tag === 'Move'
              ? { ...known, state: step.state }
              : step._tag === 'Lost'
                ? { ...known, state: 'lost', reason: 'Its agent is gone.' }
                : step._tag === 'Merged'
                  ? yield* afterMerge(
                      next,
                      yield* land({ ...known, pullRequest: step.pullRequest }, now),
                      now,
                    )
                  : {
                      ...(yield* stop(known, 'failed', step.reason, now)),
                      pullRequest: facts.pullRequest,
                    };
        if (moved !== running) next = updateMission(next, running.id, () => moved);
      }
      // A held mission frees the turn at once, so the one after it may start in the same step.
      for (let queued = nextMission(next); queued !== undefined; queued = nextMission(next)) {
        const started = yield* start(next, queued, now);
        next = withCompanions(next, started);
        if (!isFinished(started)) break;
      }
      return [next, undefined] as const;
    }),
  ).pipe(
    Effect.catch((error) =>
      Effect.logWarning('The mission loop could not advance').pipe(
        Effect.annotateLogs({ reason: reasonOf(error) }),
      ),
    ),
    Effect.withSpan('Missions.advance'),
  );

  // The multiplexer's changes, spaced; a wake-up and the tick always run.
  const spaced = multiplexer.changes.pipe(
    Stream.filterEffect(() =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const last = yield* Ref.get(lastRun);
        return now - last >= LOOP_SPACING_MS;
      }),
    ),
  );
  const tick = Stream.tick(LOOP_TICK);
  yield* Stream.mergeAll([spaced, tick, Stream.fromPubSub(trigger)], {
    concurrency: 'unbounded',
  }).pipe(
    Stream.runForEach(() =>
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((now) => Ref.set(lastRun, now)),
        Effect.andThen(advance),
      ),
    ),
    Effect.forkScoped,
  );

  return { send, list, remove, abort, resume, seen, outcome, deploy, resumePlanet, advance };
});
