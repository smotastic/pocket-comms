import {
  AUTOPILOT_LABEL_STYLE,
  BREAKER_REASON,
  breakerTripped,
  hasEnded,
  isAutopilotFailure,
  isFinished,
  isSendableHop,
  issueHash,
  LANE_LABEL_STYLE,
  missionQueue,
  namedByPullRequests,
  newNight,
  nightSummary,
  parseAutopilotSettings,
  pickHop,
  runningMission,
  SKIP_LABEL,
  toTriage,
  TRIAGE_VERDICTS,
  triageComment,
  verdictLabel,
  windowOf,
  type AutopilotFile,
  type AutopilotNight,
  type AutopilotSettings,
  type HopCandidate,
  type LocalTime,
  type Mission,
  type MissionsFile,
  type PlanetTriage,
  type TriagedIssue,
  type TriageResult,
} from '@pocket-comms/comms-domain';
import { AgentRuntime } from '@smotastic/pocket-agent';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Ref from 'effect/Ref';
import * as Result from 'effect/Result';
import * as Semaphore from 'effect/Semaphore';
import * as Stream from 'effect/Stream';
import type { AutopilotDto } from '../dto/autopilot.dto.js';
import { AutopilotOutbound } from '../ports/autopilot.outbound.port.js';
import { GiteaOutbound, type LinkedRepository } from '../ports/gitea.outbound.port.js';
import { MissionBotOutbound } from '../ports/mission-bot.outbound.port.js';
import { MissionsInbound } from '../ports/missions.inbound.port.js';
import { MissionsOutbound } from '../ports/missions.outbound.port.js';
import { PushSenderOutbound, PushSubscriptionsOutbound } from '../ports/push.outbound.port.js';
import { UsageLimitsOutbound } from '../ports/usage-limits.outbound.port.js';
import {
  makeTriageTools,
  triageInstructions,
  type RecordedVerdict,
} from '../tools/triage-tools.js';
import { makeIssuePlanet } from './issue-planet.js';
import { localClock } from './missions.use-case.js';
import { makePlanetRegistry } from './planet-registry.js';
import { makePlanets } from './planets.use-case.js';

// Autopilot (spec 038, ADR 0021): inside the owner's Autopilot window, it triages the planets at
// autopilot with Pi once, then sends their hops one at a time while the mission queue is empty,
// within the budget, until the breaker or a usage limit stops it; when the window closes it sums
// the window up for the owner. The Autopilot file is its only state; one lock orders its steps.

/** How often the Autopilot loop looks at the clock and the missions. */
const AUTOPILOT_TICK = '30 seconds';
/** How long one planet's triage may take. */
const TRIAGE_DEADLINE = '10 minutes';

const twoDigits = (value: number) => String(value).padStart(2, '0');
const dateOf = (date: Date) =>
  `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;

/** The server's local time at `now`. */
export const localTimeOf = (now: number): LocalTime => {
  const date = new Date(now);
  const yesterday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  return {
    date: dateOf(date),
    yesterday: dateOf(yesterday),
    minutes: date.getHours() * 60 + date.getMinutes(),
  };
};

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

const issueLine = (issue: {
  readonly number: number;
  readonly title: string;
  readonly body: string;
}) =>
  `#${issue.number}: ${issue.title}\n${issue.body.trim().slice(0, 2_000) || '(no description)'}`;

export const makeAutopilot = Effect.gen(function* () {
  const store = yield* AutopilotOutbound;
  const missionsStore = yield* MissionsOutbound;
  const missions = yield* MissionsInbound;
  const gitea = yield* GiteaOutbound;
  const bot = yield* MissionBotOutbound;
  const runtime = yield* AgentRuntime;
  const usageLimits = yield* UsageLimitsOutbound;
  const subscriptions = yield* PushSubscriptionsOutbound;
  const pushSender = yield* PushSenderOutbound;
  const issuePlanet = yield* makeIssuePlanet;
  const { registry } = yield* makePlanetRegistry;
  const planets = yield* makePlanets;
  const lock = yield* Semaphore.make(1);
  // The hops a send refused in the current window, so a step does not try them again.
  const refused = yield* Ref.make<{ readonly window: string; readonly keys: ReadonlySet<string> }>({
    window: '',
    keys: new Set(),
  });

  /** Tells every device of the owner; a device that cannot be reached is skipped. */
  const notify = (body: string) =>
    Effect.gen(function* () {
      const devices = yield* subscriptions.list;
      yield* Effect.forEach(
        devices,
        (device) =>
          pushSender.send(device, { title: 'Autopilot', body, tag: 'autopilot', url: '/missions' }),
        { concurrency: 'unbounded', discard: true },
      );
    }).pipe(Effect.catch(() => Effect.logWarning('The owner could not be told about Autopilot')));

  /** Leaves a record on an issue; a failure only logs. */
  const record = (what: string, effect: Effect.Effect<void, { readonly reason: string }>) =>
    effect.pipe(
      Effect.catch((error) =>
        Effect.logWarning(`The mission bot could not ${what}`).pipe(
          Effect.annotateLogs({ reason: error.reason }),
        ),
      ),
    );

  /** The planets at autopilot in effect, with their Gitea repository. */
  const autopilotPlanets = Effect.gen(function* () {
    const chosen = (yield* registry).planets.filter((planet) => planet.autonomy === 'autopilot');
    const found = yield* Effect.forEach(chosen, (settings) =>
      Effect.gen(function* () {
        const preflight = yield* planets.preflight(settings.name);
        if (preflight.autonomy.effective !== 'autopilot') return [];
        const { repository } = yield* issuePlanet(settings.name);
        return Option.isNone(repository)
          ? []
          : [{ planet: settings.name, repository: repository.value }];
      }).pipe(Effect.orElseSucceed(() => [])),
    );
    return found.flat();
  });

  /** The issues of a planet on an unfinished mission. */
  const onMission = (file: MissionsFile, planet: string): ReadonlySet<number> =>
    new Set(
      file.missions
        .filter((mission) => mission.planet === planet && !isFinished(mission))
        .map((mission) => mission.issue.number),
    );

  // ---- The triage ---------------------------------------------------------------------------

  /** One planet's triage: one Pi turn, then the bot's labels and comments. */
  const triagePlanet = (
    planet: string,
    repository: LinkedRepository,
    triaged: ReadonlyArray<TriagedIssue>,
    window: string,
  ) =>
    Effect.gen(function* () {
      const open = yield* gitea.openIssues(repository);
      const taken = toTriage(planet, open, triaged, onMission(yield* missionsStore.load, planet));
      if (taken.length === 0) {
        return { triage: { planet, verdicts: [] } satisfies PlanetTriage, written: [] };
      }
      const branch = Option.getOrElse(yield* gitea.defaultBranch(repository), () => 'master');
      const verdicts = new Map<number, RecordedVerdict>();
      const tools = yield* makeTriageTools(
        repository,
        branch,
        new Set(taken.map((issue) => issue.number)),
        verdicts,
      );
      yield* runtime
        .runTurn({
          sessionId: `autopilot-triage-${planet}-${window}`,
          instructions: triageInstructions(planet),
          state: Option.none(),
          input: ['Triage these issues:', '', ...taken.map(issueLine)].join('\n\n'),
          tools,
        })
        .pipe(Stream.runDrain, Effect.timeout(TRIAGE_DEADLINE));
      const results: Array<TriageResult> = [];
      const written: Array<TriagedIssue> = [];
      for (const issue of taken) {
        const recorded = verdicts.get(issue.number);
        if (recorded === undefined) continue;
        const add = verdictLabel(recorded.verdict);
        yield* record(
          'label a triaged issue',
          bot.relabel(
            repository,
            issue.number,
            add,
            recorded.verdict === 'not-ready' ? AUTOPILOT_LABEL_STYLE : LANE_LABEL_STYLE,
            TRIAGE_VERDICTS.map(verdictLabel),
          ),
        );
        yield* record(
          'comment on a triaged issue',
          bot.comment(repository, issue.number, triageComment(recorded.verdict, recorded.reason)),
        );
        results.push({
          number: issue.number,
          title: issue.title,
          url: issue.url,
          verdict: recorded.verdict,
          reason: recorded.reason,
        });
        written.push({
          planet,
          number: issue.number,
          hash: issueHash(issue.title, issue.body),
          verdict: recorded.verdict,
        });
      }
      return { triage: { planet, verdicts: results } satisfies PlanetTriage, written };
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          triage: {
            planet,
            verdicts: [],
            skipped: `Pi could not triage: ${reasonOf(error)}`,
          } satisfies PlanetTriage,
          written: [] as ReadonlyArray<TriagedIssue>,
        }),
      ),
      Effect.withSpan('Autopilot.triage'),
    );

  /** Triages every planet at autopilot once in the window (spec 038, requirements 6 to 10). */
  const triage = (file: AutopilotFile, night: AutopilotNight) =>
    Effect.gen(function* () {
      const targets = yield* autopilotPlanets;
      const notSetUp = runtime.notSetUp;
      if (Option.isSome(notSetUp)) {
        return {
          file,
          night: {
            ...night,
            triaged: true,
            triage: targets.map(({ planet }) => ({
              planet,
              verdicts: [],
              skipped: `Pi is not set up: ${notSetUp.value}`,
            })),
          },
        };
      }
      let triaged = file.triaged;
      const results: Array<PlanetTriage> = [];
      for (const { planet, repository } of targets) {
        const { triage: done, written } = yield* triagePlanet(
          planet,
          repository,
          triaged,
          night.window,
        );
        results.push(done);
        const keys = new Set(written.map((each) => `${each.planet}#${each.number}`));
        triaged = [
          ...triaged.filter((each) => !keys.has(`${each.planet}#${each.number}`)),
          ...written,
        ];
      }
      return { file: { ...file, triaged }, night: { ...night, triaged: true, triage: results } };
    });

  // ---- Stops and sending --------------------------------------------------------------------

  /** Records how the window's missions ended: the skip label, and the breaker (requirements 14, 15). */
  const followEndings = (night: AutopilotNight, file: MissionsFile) =>
    Effect.gen(function* () {
      const seen = new Set(night.endings.map((ending) => ending.id));
      const ended = night.sent
        .filter((id) => !seen.has(id))
        .map((id) => file.missions.find((mission) => mission.id === id))
        .filter((mission): mission is Mission => mission !== undefined && hasEnded(mission))
        .sort((a, b) => (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity));
      let next = night;
      for (const mission of ended) {
        const failed = isAutopilotFailure(mission);
        if (failed) {
          yield* record(
            'mark a failed issue for Autopilot to skip',
            bot.relabel(
              mission.repository,
              mission.issue.number,
              SKIP_LABEL,
              AUTOPILOT_LABEL_STYLE,
              [],
            ),
          );
        }
        next = { ...next, endings: [...next.endings, { id: mission.id, failed }] };
      }
      if (next.stopped === undefined && breakerTripped(next.endings)) {
        next = { ...next, stopped: BREAKER_REASON };
        yield* notify(`Autopilot stopped for tonight: ${BREAKER_REASON}`);
      }
      return next;
    });

  /** The next hop to send, when Autopilot may send one now (requirements 4, 11, 12). */
  const nextHop = (night: AutopilotNight, settings: AutopilotSettings, file: MissionsFile) =>
    Effect.gen(function* () {
      if (night.stopped !== undefined || night.sent.length >= settings.budget) return undefined;
      if (runningMission(file) !== undefined || missionQueue(file).length > 0) return undefined;
      // A hop sent once in the window is never sent again in it, whatever Gitea shows yet.
      const sentKeys = night.sent.flatMap((id) => {
        const mission = file.missions.find((each) => each.id === id);
        return mission === undefined ? [] : [`${mission.planet}#${mission.issue.number}`];
      });
      const skip = new Set([...(yield* Ref.get(refused)).keys, ...sentKeys]);
      const candidates: Array<HopCandidate> = [];
      for (const { planet, repository } of yield* autopilotPlanets) {
        const open = yield* gitea.openIssues(repository).pipe(Effect.orElseSucceed(() => []));
        const named = namedByPullRequests(open);
        const busy = onMission(file, planet);
        for (const issue of open) {
          if (isSendableHop(issue, named, busy) && !skip.has(`${planet}#${issue.number}`)) {
            candidates.push({ planet, issue });
          }
        }
      }
      const sentByPlanet = new Map<string, number>();
      for (const id of night.sent) {
        const planet = file.missions.find((mission) => mission.id === id)?.planet;
        if (planet !== undefined) sentByPlanet.set(planet, (sentByPlanet.get(planet) ?? 0) + 1);
      }
      return pickHop(candidates, sentByPlanet);
    });

  // ---- The loop ---------------------------------------------------------------------------------

  /** One step of Autopilot. */
  const step = lock
    .withPermits(1)(
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        let file = yield* store.load;
        const window = windowOf(file.settings, localTimeOf(now));

        // The window that closed: its summary, once (requirement 19).
        if (file.night !== undefined && file.night.window !== window && !file.night.summarySent) {
          const summary = nightSummary(file.night, (yield* missionsStore.load).missions);
          if (summary !== undefined) yield* notify(summary);
          file = { ...file, night: { ...file.night, summarySent: true } };
          yield* store.save(file);
        }
        if (window === undefined || !file.settings.enabled) return;

        let night = file.night?.window === window ? file.night : newNight(window);
        if ((yield* Ref.get(refused)).window !== window) {
          yield* Ref.set(refused, { window, keys: new Set<string>() });
        }
        if (!night.triaged) {
          const triaged = yield* triage(file, night);
          file = triaged.file;
          night = triaged.night;
          yield* store.save({ ...file, night });
        }

        // Read after the triage, which may take minutes.
        const missionsFile = yield* missionsStore.load;
        night = yield* followEndings(night, missionsFile);
        if (night.stopped === undefined) {
          const limits = yield* usageLimits.limits;
          const reached = [...limits.values()].filter((until) => until > now);
          if (reached.length > 0) {
            night = {
              ...night,
              stopped: `Claude's usage limit is reached until ${localClock(Math.max(...reached))}.`,
            };
          }
        }

        const hop = yield* nextHop(night, file.settings, missionsFile);
        if (hop !== undefined) {
          const sent = yield* missions
            .send(hop.planet, hop.issue.number, 'hop', { autopilot: true })
            .pipe(Effect.result);
          if (Result.isSuccess(sent)) {
            night = { ...night, sent: [...night.sent, sent.success.id] };
          } else {
            yield* Ref.update(refused, (current) => ({
              ...current,
              keys: new Set([...current.keys, `${hop.planet}#${hop.issue.number}`]),
            }));
            yield* Effect.logWarning('Autopilot could not send a hop').pipe(
              Effect.annotateLogs({
                planet: hop.planet,
                issue: hop.issue.number,
                reason: reasonOf(sent.failure),
              }),
            );
          }
        }
        if (night !== file.night) yield* store.save({ ...file, night });
      }),
    )
    .pipe(
      Effect.catch((error) =>
        Effect.logWarning('Autopilot could not take a step').pipe(
          Effect.annotateLogs({ reason: reasonOf(error) }),
        ),
      ),
      Effect.withSpan('Autopilot.step'),
    );

  // ---- The owner's requests -------------------------------------------------------------------

  const view = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const file = yield* store.load;
    const missionsFile = yield* missionsStore.load;
    const night = file.night;
    const planetsAtAutopilot = (yield* autopilotPlanets).map(({ planet }) => planet);
    return {
      settings: file.settings,
      open: windowOf(file.settings, localTimeOf(now)) !== undefined,
      planets: planetsAtAutopilot,
      night:
        night === undefined
          ? undefined
          : {
              window: night.window,
              triaged: night.triaged,
              triage: night.triage,
              sent: night.sent.flatMap((id) => {
                const mission = missionsFile.missions.find((each) => each.id === id);
                return mission === undefined
                  ? []
                  : [
                      {
                        id: mission.id,
                        planet: mission.planet,
                        issue: mission.issue,
                        state: mission.state,
                      },
                    ];
              }),
              stopped: night.stopped,
            },
    } satisfies AutopilotDto;
  }).pipe(Effect.withSpan('Autopilot.view'));

  const update = Effect.fn('Autopilot.update')(function* (input: AutopilotSettings) {
    const settings = parseAutopilotSettings(input);
    if (Result.isFailure(settings)) return yield* settings.failure;
    yield* lock.withPermits(1)(
      Effect.gen(function* () {
        const file = yield* store.load;
        yield* store.save({ ...file, settings: settings.success });
      }),
    );
    return yield* view;
  });

  yield* Stream.tick(AUTOPILOT_TICK).pipe(
    Stream.runForEach(() => step),
    Effect.forkScoped,
  );

  return { view, update, step };
});
