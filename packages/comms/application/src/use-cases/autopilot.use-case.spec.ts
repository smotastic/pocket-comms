import { describe, expect, it } from '@effect/vitest';
import { isFinished, type Mission } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { TestClock } from 'effect/testing';
import { MissionRefusedError } from '../errors.js';
import { MissionsInbound } from '../ports/missions.inbound.port.js';
import { fakeIssue, fakeLayer, FakeState } from '../testing/fakes.js';
import { localTimeOf, makeAutopilot } from './autopilot.use-case.js';

// Autopilot (spec 038) on the fakes. Its missions are a fake too that only queues them, so a test
// decides how each one ends.

const fakeMissions = Layer.effect(
  MissionsInbound,
  Effect.gen(function* () {
    const state = yield* FakeState;
    const unused = Effect.die('Not used by Autopilot.');
    return MissionsInbound.of({
      send: (planet, number, lane, options) =>
        Effect.gen(function* () {
          const open = state.missions.missions.find(
            (mission) =>
              mission.planet === planet && mission.issue.number === number && !isFinished(mission),
          );
          if (open !== undefined) {
            return yield* new MissionRefusedError({
              reason: `#${number} is on a mission already.`,
            });
          }
          const mission: Mission = {
            id: `m${state.missions.missions.length + 1}`,
            planet,
            repository: { owner: 'owner', name: planet },
            issue: { number, title: `#${number}`, url: `http://gitea/${number}` },
            lane,
            state: 'queued',
            sentAt: 0,
            ...(options?.autopilot === true ? { autopilot: true } : {}),
          };
          state.missions = { ...state.missions, missions: [...state.missions.missions, mission] };
          return { ...mission, autopilot: mission.autopilot };
        }),
      list: unused,
      remove: () => unused,
      abort: () => unused,
      resume: () => unused,
      deploy: () => unused,
      resumePlanet: () => unused,
      seen: () => unused,
      outcome: () => unused,
    });
  }),
);

const layer = () => Layer.provideMerge(fakeMissions, fakeLayer());

const AGENTS_MD = `# app\n\n\`\`\`json mission-control\n{"releases":[{"tag":"app-v","paths":["apps/"],"workflow":"release.yml","app":"pocket-app"}],"migrations":[]}\n\`\`\`\n`;

/** The local moment of 2026-11-27 (or the day given) at `time`. */
const at = (time: string, day = 27) => {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2026, 10, day, hours ?? 0, minutes ?? 0).getTime();
};

/** A planet `app` at autopilot that deploys, with the given open issues. */
const autopilot = (
  state: FakeState['Service'],
  issues: ReadonlyArray<Parameters<typeof fakeIssue>[0]>,
) => {
  state.registry = {
    appsSeeded: true,
    planets: [{ name: 'app', autonomy: 'autopilot', apps: ['pocket-app'] }],
  };
  state.giteaRepositories.set('owner/app', {
    defaultBranch: 'master',
    files: new Map([
      ['AGENTS.md', AGENTS_MD],
      ['.github/workflows/ci.yml', 'on: push'],
      ['package.json', '{"scripts":{"verify":"pocket-ci verify"}}'],
    ]),
    runs: [{ status: 'completed', conclusion: 'success' }],
  });
  state.issues.set('owner/app', issues.map(fakeIssue));
  state.pushSubscriptions = [
    { endpoint: 'https://push.test/1', keys: { p256dh: 'k', auth: 'a' } },
  ] as typeof state.pushSubscriptions;
};

const hop = (number: number, labels: ReadonlyArray<string> = []) => ({
  number,
  title: `Hop ${number}`,
  labels: ['mission:hop', ...labels],
});

const sentIssues = (state: FakeState['Service']) =>
  state.missions.missions
    .filter((mission) => mission.autopilot === true)
    .map((m) => m.issue.number);

const endAs = (state: FakeState['Service'], number: number, change: Partial<Mission>) => {
  state.missions = {
    ...state.missions,
    missions: state.missions.missions.map((mission) =>
      mission.issue.number === number ? { ...mission, ...change } : mission,
    ),
  };
};

describe('the Autopilot window and switch (spec 038, requirements 3 to 5)', () => {
  it('names the local time of a moment', () => {
    expect(localTimeOf(at('00:30', 28))).toEqual({
      date: '2026-11-28',
      yesterday: '2026-11-27',
      minutes: 30,
    });
  });

  it.effect('does nothing outside the window, or with the switch off', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      autopilot(state, [hop(3), { number: 4, title: 'New' }]);
      yield* TestClock.setTime(at('22:59'));
      const { step } = yield* makeAutopilot;

      yield* step;
      expect(state.turns).toHaveLength(0);
      expect(sentIssues(state)).toEqual([]);

      state.autopilot = {
        ...state.autopilot,
        settings: { ...state.autopilot.settings, enabled: false },
      };
      yield* TestClock.setTime(at('23:30'));
      yield* step;
      expect(state.turns).toHaveLength(0);
      expect(sentIssues(state)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('validates and keeps the settings', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const { update } = yield* makeAutopilot;

      const error = yield* update({ enabled: true, start: '25:00', end: '07:00', budget: 5 }).pipe(
        Effect.flip,
      );
      expect(error._tag).toBe('InvalidInputError');
      const view = yield* update({ enabled: false, start: '22:00', end: '06:00', budget: 2 });
      expect(view.settings).toEqual({ enabled: false, start: '22:00', end: '06:00', budget: 2 });
      expect(state.autopilot.settings.budget).toBe(2);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});

describe('the triage (spec 038, requirements 6 to 10)', () => {
  it.effect('triages once per window with Pi, then the bot labels and comments', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      autopilot(state, [
        { number: 4, title: 'Wrong plural', body: '1 missions' },
        { number: 5, title: 'New screen' },
        hop(6),
      ]);
      state.script.push([
        { tool: 'read_issue', input: { number: 4 } },
        { tool: 'record_verdict', input: { number: 4, verdict: 'hop', reason: 'One string.' } },
        {
          tool: 'record_verdict',
          input: { number: 5, verdict: 'full-flight', reason: 'A feature.' },
        },
        { tool: 'record_verdict', input: { number: 6, verdict: 'hop', reason: 'Not listed.' } },
      ]);
      yield* TestClock.setTime(at('23:00'));
      const { step, view } = yield* makeAutopilot;

      yield* step;
      yield* step;

      expect(state.turns).toHaveLength(1);
      expect(state.turns[0]?.input).toContain('#4: Wrong plural');
      expect(state.turns[0]?.input).not.toContain('#6');
      expect(state.turns[0]?.tools.map((tool) => tool.name)).toEqual([
        'read_issue',
        'list_folder',
        'read_file',
        'record_verdict',
      ]);
      expect(state.bot.calls).toContain(
        'relabel owner/app 4 +mission:hop -mission:hop,mission:full-flight,autopilot:not-ready',
      );
      expect(state.bot.calls).toContain('comment owner/app 4 Autopilot triage: hop — One string.');
      expect(state.bot.calls).toContain(
        'comment owner/app 5 Autopilot triage: full flight — A feature.',
      );
      expect(state.autopilot.triaged.map((each) => [each.number, each.verdict])).toEqual([
        [4, 'hop'],
        [5, 'full-flight'],
      ]);
      const night = (yield* view).night;
      expect(night?.triage[0]?.verdicts.map((verdict) => verdict.verdict)).toEqual([
        'hop',
        'full-flight',
      ]);
      // The owner's hop #6 is sent; #4's label is on Gitea, not yet in the issue list read.
      expect(sentIssues(state)).toEqual([6]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('skips the triage without Pi and still sends the labelled hops', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      autopilot(state, [hop(6), { number: 7, title: 'New' }]);
      state.notSetUp = 'COMMS_BRAINSTORM_MODEL is not set.';
      yield* TestClock.setTime(at('23:30'));
      const { step, view } = yield* makeAutopilot;

      yield* step;

      expect(state.turns).toHaveLength(0);
      expect((yield* view).night?.triage).toEqual([
        {
          planet: 'app',
          verdicts: [],
          skipped: 'Pi is not set up: COMMS_BRAINSTORM_MODEL is not set.',
        },
      ]);
      expect(sentIssues(state)).toEqual([6]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('does not triage a planet that is not at autopilot in effect', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      autopilot(state, [hop(6), { number: 7, title: 'New' }]);
      // No deploy checks pass without the release block: the planet is at missions in effect.
      state.giteaRepositories.set('owner/app', {
        defaultBranch: 'master',
        runs: [{ status: 'completed', conclusion: 'success' }],
        files: new Map([
          ['AGENTS.md', '# app'],
          ['.github/workflows/ci.yml', 'on: push'],
          ['package.json', '{"scripts":{"verify":"pocket-ci verify"}}'],
        ]),
      });
      yield* TestClock.setTime(at('23:30'));
      const { step, view } = yield* makeAutopilot;

      yield* step;

      expect(state.turns).toHaveLength(0);
      expect(sentIssues(state)).toEqual([]);
      expect((yield* view).planets).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});

describe('sending hops (spec 038, requirements 4, 11 and 12)', () => {
  it.effect('sends by priority, one at a time while the queue is empty, within the budget', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      autopilot(state, [hop(3), hop(9, ['priority/high']), hop(10)]);
      state.notSetUp = 'none';
      state.autopilot = {
        ...state.autopilot,
        settings: { ...state.autopilot.settings, budget: 2 },
      };
      yield* TestClock.setTime(at('23:30'));
      const { step } = yield* makeAutopilot;

      yield* step;
      expect(sentIssues(state)).toEqual([9]);
      // #9 is queued or running: nothing more yet.
      yield* step;
      expect(sentIssues(state)).toEqual([9]);

      endAs(state, 9, { state: 'deployed', finishedAt: 1 });
      yield* step;
      expect(sentIssues(state)).toEqual([9, 3]);
      endAs(state, 3, { state: 'deployed', finishedAt: 2 });
      yield* step;
      expect(sentIssues(state)).toEqual([9, 3]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect("waits for the owner's queued missions", () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      autopilot(state, [hop(3), { number: 4, title: "The owner's" }]);
      state.notSetUp = 'none';
      yield* TestClock.setTime(at('23:30'));
      const missions = yield* MissionsInbound;
      yield* missions.send('app', 4, 'hop');
      const { step } = yield* makeAutopilot;

      yield* step;

      expect(sentIssues(state)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});

describe('stops (spec 038, requirements 14, 15 and 18)', () => {
  it.effect('labels a failed issue to skip, and stops after two failures in a row', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      autopilot(state, [hop(3), hop(4), hop(5)]);
      state.notSetUp = 'none';
      yield* TestClock.setTime(at('23:30'));
      const { step, view } = yield* makeAutopilot;

      yield* step;
      endAs(state, 3, { state: 'failed', finishedAt: 1 });
      yield* step;
      expect(state.bot.calls).toContain('relabel owner/app 3 +autopilot:skip -');
      expect(sentIssues(state)).toEqual([3, 4]);

      endAs(state, 4, { state: 'aborted', finishedAt: 2 });
      yield* step;
      expect(sentIssues(state)).toEqual([3, 4]);
      expect((yield* view).night?.stopped).toBe('two missions in a row failed.');
      expect(state.pushes.map((push) => push.notification.body)).toContain(
        'Autopilot stopped for tonight: two missions in a row failed.',
      );
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect("stops sending while Claude's usage limit is reached", () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      autopilot(state, [hop(3)]);
      state.notSetUp = 'none';
      yield* TestClock.setTime(at('23:30'));
      state.usageLimits.set('s9', at('23:30') + 60 * 60_000);
      const { step, view } = yield* makeAutopilot;

      yield* step;

      expect(sentIssues(state)).toEqual([]);
      expect((yield* view).night?.stopped).toBe("Claude's usage limit is reached until 00:30.");
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});

describe('the morning summary (spec 038, requirement 19)', () => {
  it.effect('sums the window up once when it closes', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      autopilot(state, [hop(3)]);
      state.notSetUp = 'none';
      yield* TestClock.setTime(at('23:30'));
      const { step } = yield* makeAutopilot;
      yield* step;
      endAs(state, 3, { state: 'deployed', finishedAt: 1 });

      yield* TestClock.setTime(at('07:00', 28));
      yield* step;
      yield* step;

      const bodies = state.pushes.map((push) => push.notification.body);
      expect(bodies.filter((body) => body.startsWith('Autopilot: '))).toEqual([
        'Autopilot: 1 deployed. Triage of app skipped: Pi is not set up: none',
      ]);
      expect(state.autopilot.night?.summarySent).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );
});
