import { describe, expect, it } from '@effect/vitest';
import * as Result from 'effect/Result';
import {
  breakerTripped,
  DEFAULT_AUTOPILOT,
  isSendableHop,
  issueHash,
  namedByPullRequests,
  newNight,
  nightSummary,
  parseAutopilotSettings,
  pickHop,
  toTriage,
  triageComment,
  verdictLabel,
  windowOf,
  type AutopilotNight,
  type TriagedIssue,
} from './autopilot.js';
import type { Issue } from './issue.js';
import type { Mission } from './mission.js';

const issue = (over: Partial<Issue> & Pick<Issue, 'number'>): Issue => ({
  title: `Issue ${over.number}`,
  body: 'Text.',
  labels: [],
  updatedAt: 0,
  url: `http://gitea/${over.number}`,
  state: 'open',
  pull: false,
  ...over,
});

const at = (date: string, yesterday: string, time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return { date, yesterday, minutes: (hours ?? 0) * 60 + (minutes ?? 0) };
};

describe('the Autopilot settings (spec 038, requirement 3)', () => {
  it('defaults to on, 23:00 to 07:00 and a budget of 5', () => {
    expect(DEFAULT_AUTOPILOT).toEqual({ enabled: true, start: '23:00', end: '07:00', budget: 5 });
  });

  it('takes two different HH:MM times and a budget from 0 to 50', () => {
    expect(Result.isSuccess(parseAutopilotSettings(DEFAULT_AUTOPILOT))).toBe(true);
    expect(
      Result.isSuccess(parseAutopilotSettings({ ...DEFAULT_AUTOPILOT, budget: 0, start: '00:00' })),
    ).toBe(true);
    const bad = parseAutopilotSettings({ enabled: true, start: '7:00', end: '24:00', budget: 51 });
    expect(Result.isFailure(bad) ? bad.failure.issues.map((each) => each.field) : []).toEqual([
      'start',
      'end',
      'budget',
    ]);
    const same = parseAutopilotSettings({ ...DEFAULT_AUTOPILOT, end: '23:00' });
    expect(Result.isFailure(same) ? same.failure.issues[0]?.field : undefined).toBe('end');
    expect(Result.isFailure(parseAutopilotSettings({ ...DEFAULT_AUTOPILOT, budget: 1.5 }))).toBe(
      true,
    );
  });
});

describe('the Autopilot window (spec 038, requirement 4)', () => {
  it('names a window across midnight by the date it opened', () => {
    const night = DEFAULT_AUTOPILOT;
    expect(windowOf(night, at('2026-11-27', '2026-11-26', '22:59'))).toBeUndefined();
    expect(windowOf(night, at('2026-11-27', '2026-11-26', '23:00'))).toBe('2026-11-27');
    expect(windowOf(night, at('2026-11-28', '2026-11-27', '00:30'))).toBe('2026-11-27');
    expect(windowOf(night, at('2026-11-28', '2026-11-27', '06:59'))).toBe('2026-11-27');
    expect(windowOf(night, at('2026-11-28', '2026-11-27', '07:00'))).toBeUndefined();
  });

  it('keeps a window within one day to that day', () => {
    const day = { ...DEFAULT_AUTOPILOT, start: '09:00', end: '17:00' };
    expect(windowOf(day, at('2026-11-27', '2026-11-26', '08:59'))).toBeUndefined();
    expect(windowOf(day, at('2026-11-27', '2026-11-26', '09:00'))).toBe('2026-11-27');
    expect(windowOf(day, at('2026-11-27', '2026-11-26', '17:00'))).toBeUndefined();
  });
});

describe('the triage (spec 038, requirements 8 and 9)', () => {
  const triaged = (
    number: number,
    verdict: TriagedIssue['verdict'],
    hash: string,
  ): TriagedIssue => ({
    planet: 'app',
    number,
    hash,
    verdict,
  });

  it('takes the issues without a verdict label, oldest first', () => {
    const open = [
      issue({ number: 9 }),
      issue({ number: 3 }),
      issue({ number: 5, labels: ['bug'] }),
    ];
    expect(toTriage('app', open, [], new Set()).map((each) => each.number)).toEqual([3, 5, 9]);
  });

  it('leaves alone pull requests, in-progress, skipped, named, on-mission and fix issues', () => {
    const open = [
      issue({ number: 1, pull: true, body: 'Closes #2' }),
      issue({ number: 2 }),
      issue({ number: 3, labels: ['status/in-progress'] }),
      issue({ number: 4, labels: ['autopilot:skip'] }),
      issue({ number: 5 }),
      issue({ number: 6, title: 'Fix the failed deploy of app-v0.2.0' }),
      issue({ number: 7 }),
    ];
    expect(toTriage('app', open, [], new Set([5])).map((each) => each.number)).toEqual([7]);
  });

  it('never takes a label the owner set, and takes an edited one Autopilot set', () => {
    const owner = issue({ number: 1, labels: ['mission:hop'] });
    const notReady = issue({ number: 2, labels: ['autopilot:not-ready'] });
    const unchanged = issue({ number: 3, labels: ['mission:hop'] });
    const edited = issue({ number: 4, labels: ['autopilot:not-ready'], body: 'Now clear.' });
    const relabelled = issue({ number: 5, labels: ['mission:full-flight'], body: 'Edited.' });
    const before = [
      triaged(3, 'hop', issueHash('Issue 3', 'Text.')),
      triaged(4, 'not-ready', issueHash('Issue 4', 'Text.')),
      triaged(5, 'hop', issueHash('Issue 5', 'Text.')),
    ];
    expect(
      toTriage('app', [owner, notReady, unchanged, edited, relabelled], before, new Set()).map(
        (each) => each.number,
      ),
    ).toEqual([4]);
  });

  it('takes at most 30 issues of a planet', () => {
    const open = Array.from({ length: 40 }, (_, index) => issue({ number: index + 1 }));
    const taken = toTriage('app', open, [], new Set());
    expect(taken).toHaveLength(30);
    expect(taken.at(-1)?.number).toBe(30);
  });

  it('names the pull requests, labels and comments', () => {
    expect([
      ...namedByPullRequests([issue({ number: 8, pull: true, title: 'Fix #3 and #12' })]),
    ]).toEqual([3, 12]);
    expect(verdictLabel('hop')).toBe('mission:hop');
    expect(verdictLabel('full-flight')).toBe('mission:full-flight');
    expect(verdictLabel('not-ready')).toBe('autopilot:not-ready');
    expect(triageComment('full-flight', ' Needs a new screen. ')).toBe(
      'Autopilot triage: full flight — Needs a new screen.',
    );
    expect(issueHash('a', 'b')).not.toBe(issueHash('a', 'c'));
    expect(issueHash('a', 'b')).toMatch(/^[0-9a-f]{8}$/u);
  });
});

describe('sending hops (spec 038, requirements 11 and 12)', () => {
  it('sends only open hops Autopilot may touch', () => {
    const none = new Set<number>();
    expect(isSendableHop(issue({ number: 1, labels: ['mission:hop'] }), none, none)).toBe(true);
    expect(isSendableHop(issue({ number: 2, labels: ['mission:full-flight'] }), none, none)).toBe(
      false,
    );
    expect(
      isSendableHop(issue({ number: 3, labels: ['mission:hop', 'autopilot:skip'] }), none, none),
    ).toBe(false);
    expect(
      isSendableHop(
        issue({ number: 4, labels: ['mission:hop', 'autopilot:not-ready'] }),
        none,
        none,
      ),
    ).toBe(false);
    expect(isSendableHop(issue({ number: 5, labels: ['mission:hop'] }), new Set([5]), none)).toBe(
      false,
    );
  });

  it('lets planets take turns, priority first, then the oldest', () => {
    const candidates = [
      { planet: 'a', issue: issue({ number: 3 }) },
      { planet: 'a', issue: issue({ number: 9, labels: ['priority/high'] }) },
      { planet: 'b', issue: issue({ number: 4 }) },
      { planet: 'a', issue: issue({ number: 7, labels: ['priority/medium'] }) },
    ];
    const order: Array<string> = [];
    const sent = new Map<string, number>();
    let left = candidates;
    for (let next = pickHop(left, sent); next !== undefined; next = pickHop(left, sent)) {
      const picked = next;
      order.push(`${picked.planet}#${picked.issue.number}`);
      sent.set(picked.planet, (sent.get(picked.planet) ?? 0) + 1);
      left = left.filter((each) => each !== picked);
    }
    expect(order).toEqual(['a#9', 'b#4', 'a#7', 'a#3']);
  });
});

const mission = (id: string, state: Mission['state']): Mission => ({
  id,
  planet: 'app',
  repository: { owner: 'o', name: 'app' },
  issue: { number: 1, title: 't', url: 'u' },
  lane: 'hop',
  state,
  sentAt: 0,
});

describe('the breaker and the summary (spec 038, requirements 15 and 19)', () => {
  it('trips on two failures in a row', () => {
    expect(breakerTripped([{ id: 'a', failed: true }])).toBe(false);
    expect(
      breakerTripped([
        { id: 'a', failed: true },
        { id: 'b', failed: false },
        { id: 'c', failed: true },
      ]),
    ).toBe(false);
    expect(
      breakerTripped([
        { id: 'a', failed: false },
        { id: 'b', failed: true },
        { id: 'c', failed: true },
      ]),
    ).toBe(true);
  });

  it('sums a window up, and says nothing of a quiet one', () => {
    expect(nightSummary(newNight('2026-11-27'), [])).toBeUndefined();
    const night: AutopilotNight = {
      ...newNight('2026-11-27'),
      sent: ['m1', 'm2'],
      triage: [
        {
          planet: 'app',
          verdicts: [
            { number: 1, title: 't', url: 'u', verdict: 'hop', reason: 'r' },
            { number: 2, title: 't', url: 'u', verdict: 'full-flight', reason: 'r' },
            { number: 3, title: 't', url: 'u', verdict: 'full-flight', reason: 'r' },
            { number: 4, title: 't', url: 'u', verdict: 'not-ready', reason: 'r' },
          ],
        },
        { planet: 'lens', verdicts: [], skipped: 'Pi is not set up.' },
      ],
    };
    expect(nightSummary(night, [mission('m1', 'deployed'), mission('m2', 'failed')])).toBe(
      'Autopilot: 1 deployed, 1 failed, 2 full flights wait for your grilling, 1 not ready. Triage of lens skipped: Pi is not set up.',
    );
    expect(
      nightSummary({ ...newNight('d'), sent: ['m1'], stopped: 'two missions in a row failed.' }, [
        mission('m1', 'working'),
      ]),
    ).toBe('Autopilot: 1 still running. Stopped: two missions in a row failed.');
  });
});
