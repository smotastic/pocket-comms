import {
  agentNameFor,
  endComment,
  isNewInLog,
  issueBranch,
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
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { MissionBotOutbound } from '../ports/mission-bot.outbound.port.js';
import { MissionSettings } from '../ports/mission-settings.port.js';
import { MissionsOutbound } from '../ports/missions.outbound.port.js';
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
  isNew: isNewInLog(file, mission) ? true : undefined,
});

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
  const { settingsPath } = yield* MissionSettings;
  const issuePlanet = yield* makeIssuePlanet;
  const planets = yield* makePlanets;
  const { deliver, keep } = yield* makeAgentLaunch;
  const lock = yield* Semaphore.make(1);
  const trigger = yield* PubSub.unbounded<void>();
  const lastRun = yield* Ref.make(0);

  const settings = ['--settings', settingsPath];

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

  /** Ends a running mission without a merge: its agent stops, its worktree and branch stay. */
  const stop = (mission: Mission, state: 'failed' | 'aborted', reason: string, now: number) =>
    Effect.gen(function* () {
      yield* closeWorkspace(mission);
      yield* record(
        'remove the in-progress label',
        bot.unmarkInProgress(mission.repository, mission.issue.number),
      );
      yield* record(
        'comment on the issue',
        bot.comment(mission.repository, mission.issue.number, endComment(state, reason)),
      );
      return { ...mission, state, reason, finishedAt: now, agent: undefined } satisfies Mission;
    });

  /** The mission after a merge: its agent closed, its worktree removed unless it has changes. */
  const land = (mission: Mission, now: number) =>
    Effect.gen(function* () {
      yield* closeWorkspace(mission);
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
    yield* change((file) =>
      missionWith(file, id, (mission) => mission.state === 'queued').pipe(
        Effect.map(
          () =>
            [
              { ...file, missions: file.missions.filter((mission) => mission.id !== id) },
              undefined,
            ] as const,
        ),
      ),
    );
  });

  const abort = Effect.fn('Missions.abort')(function* (id: string) {
    yield* change((file, now) =>
      Effect.gen(function* () {
        const mission = yield* missionWith(
          file,
          id,
          (each) => runningMission(file)?.id === each.id,
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
    yield* change((file, now) =>
      Effect.gen(function* () {
        const mission = runningMission(file);
        if (mission === undefined || mission.agent !== agent) {
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
      let next = file;
      const running = runningMission(next);
      if (running !== undefined && running.state !== 'lost') {
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
                  ? yield* land({ ...known, pullRequest: step.pullRequest }, now)
                  : {
                      ...(yield* stop(known, 'failed', step.reason, now)),
                      pullRequest: facts.pullRequest,
                    };
        if (moved !== running) next = updateMission(next, running.id, () => moved);
      }
      // A held mission frees the turn at once, so the one after it may start in the same step.
      for (let queued = nextMission(next); queued !== undefined; queued = nextMission(next)) {
        const started = yield* start(next, queued, now);
        next = updateMission(next, queued.id, () => started);
        if (started.state !== 'held' && started.state !== 'failed') break;
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

  return { send, list, remove, abort, resume, seen, outcome, advance };
});
