import { describe, expect, it } from 'vitest';
import {
  awaitingDeploy,
  failureWords,
  isDeployFailure,
  isFinished,
  isRunning,
  lastDeploy,
  unreleasedTags,
  pausingDeploy,
  planetWaitsForOwner,
  keptWorktree,
  laneLabel,
  laneOfLabels,
  missionLog,
  missionPrompt,
  missionQueue,
  missionStep,
  newInLog,
  nextMission,
  pruneMissions,
  runningMission,
  sendRefusal,
  type Mission,
  type MissionsFile,
} from './mission.js';

const DAY = 24 * 60 * 60 * 1000;

const mission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'm1',
  planet: 'pocket-home',
  repository: { owner: 'smotastic', name: 'pocket-home' },
  issue: { number: 7, title: 'Fix the header', url: 'http://gitea/smotastic/pocket-home/issues/7' },
  lane: 'hop',
  state: 'queued',
  sentAt: 1_000,
  ...overrides,
});

const file = (...missions: ReadonlyArray<Mission>): MissionsFile => ({ missions, seenAt: 0 });

describe('lanes', () => {
  it('names each lane with its label, and reads one lane back', () => {
    expect(laneLabel('hop')).toBe('mission:hop');
    expect(laneLabel('full-flight')).toBe('mission:full-flight');
    expect(laneOfLabels(['bug', 'mission:full-flight'])).toBe('full-flight');
  });

  it('reads no lane from none, or from both', () => {
    expect(laneOfLabels(['bug'])).toBeUndefined();
    expect(laneOfLabels(['mission:hop', 'mission:full-flight'])).toBeUndefined();
  });
});

describe('sending', () => {
  const open = { number: 7, state: 'open' as const, pull: false };

  it('accepts an open issue without an unfinished mission', () => {
    expect(sendRefusal(file(), 'pocket-home', open)).toBeUndefined();
    expect(
      sendRefusal(file(mission({ state: 'aborted', finishedAt: 2 })), 'pocket-home', open),
    ).toBeUndefined();
  });

  it('refuses a closed issue, a pull request and an issue on a mission already', () => {
    expect(sendRefusal(file(), 'pocket-home', { ...open, state: 'closed' })).toBe('#7 is closed.');
    expect(sendRefusal(file(), 'pocket-home', { ...open, pull: true })).toBe(
      '#7 is a pull request, not an issue.',
    );
    expect(sendRefusal(file(mission()), 'pocket-home', open)).toBe(
      '#7 is on a mission already (queued).',
    );
    expect(sendRefusal(file(mission()), 'pocket-lens', open)).toBeUndefined();
  });
});

describe('the mission queue', () => {
  const older = mission({ id: 'a', sentAt: 1 });
  const newer = mission({ id: 'b', sentAt: 2, planet: 'pocket-lens' });

  it('runs first in, first out', () => {
    expect(missionQueue(file(newer, older)).map((each) => each.id)).toEqual(['a', 'b']);
    expect(nextMission(file(newer, older))?.id).toBe('a');
  });

  it('starts nothing while a mission runs or is lost', () => {
    expect(nextMission(file(newer, mission({ id: 'r', state: 'working' })))).toBeUndefined();
    expect(nextMission(file(newer, mission({ id: 'r', state: 'lost' })))).toBeUndefined();
    expect(runningMission(file(newer, mission({ id: 'r', state: 'lost' })))?.id).toBe('r');
  });

  it('starts the next one after a finished one', () => {
    expect(nextMission(file(newer, mission({ id: 'r', state: 'held', finishedAt: 3 })))?.id).toBe(
      'b',
    );
  });
});

describe('a kept worktree', () => {
  const worktree = { path: '/w/feat-7', branch: 'fix/7-header', workspaceId: '/w/feat-7' };

  it('is the newest of an aborted or failed mission of the same issue', () => {
    const sent = mission({ id: 'new' });
    const kept = mission({ id: 'old', state: 'aborted', finishedAt: 5, worktree });
    expect(keptWorktree(file(sent, kept), sent)).toEqual(worktree);
  });

  it('is never one of a merged mission, or of another issue', () => {
    const sent = mission({ id: 'new' });
    expect(
      keptWorktree(
        file(sent, mission({ id: 'm', state: 'merged', finishedAt: 5, worktree })),
        sent,
      ),
    ).toBeUndefined();
    expect(
      keptWorktree(
        file(
          sent,
          mission({
            id: 'o',
            state: 'failed',
            finishedAt: 5,
            worktree,
            issue: { ...sent.issue, number: 8 },
          }),
        ),
        sent,
      ),
    ).toBeUndefined();
  });
});

describe('the mission log', () => {
  const now = 100 * DAY;

  it('lists finished missions newest first, held ones included', () => {
    const log = missionLog(
      file(
        mission({ id: 'q' }),
        mission({ id: 'a', state: 'merged', finishedAt: 10 }),
        mission({ id: 'b', state: 'held', finishedAt: 30 }),
        mission({ id: 'c', state: 'failed', finishedAt: 20 }),
      ),
    );
    expect(log.map((each) => each.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps finished missions for 90 days, and every open one', () => {
    const kept = pruneMissions(
      file(
        mission({ id: 'old', state: 'merged', finishedAt: now - 91 * DAY }),
        mission({ id: 'recent', state: 'merged', finishedAt: now - 89 * DAY }),
        mission({ id: 'queued', sentAt: 1 }),
      ),
      now,
    );
    expect(kept.missions.map((each) => each.id)).toEqual(['recent', 'queued']);
  });

  it('counts what finished since the owner last looked', () => {
    const missions = file(
      mission({ id: 'a', state: 'merged', finishedAt: 10 }),
      mission({ id: 'b', state: 'failed', finishedAt: 30 }),
      mission({ id: 'c', state: 'working' }),
    );
    expect(newInLog({ ...missions, seenAt: 0 })).toBe(2);
    expect(newInLog({ ...missions, seenAt: 20 })).toBe(1);
    expect(newInLog({ ...missions, seenAt: 30 })).toBe(0);
  });
});

describe('the step of a running mission', () => {
  const working = mission({ state: 'working' });
  const pull = { number: 12, url: 'http://gitea/pulls/12' };

  it('waits on the owner while its agent waits, and works otherwise', () => {
    expect(missionStep(working, { agent: { status: 'blocked' }, pullRequest: undefined })).toEqual({
      _tag: 'Move',
      state: 'waiting',
    });
    expect(
      missionStep(mission({ state: 'waiting' }), {
        agent: { status: 'working' },
        pullRequest: undefined,
      }),
    ).toEqual({ _tag: 'Move', state: 'working' });
    expect(missionStep(working, { agent: { status: 'idle' }, pullRequest: undefined })).toEqual({
      _tag: 'Stay',
    });
  });

  it('moves to pull request once one is attached, and ends when it is merged or closed', () => {
    expect(
      missionStep(working, {
        agent: { status: 'working' },
        pullRequest: { ...pull, state: 'open' },
      }),
    ).toEqual({ _tag: 'Move', state: 'pull-request' });
    expect(
      missionStep(mission({ state: 'pull-request' }), {
        agent: undefined,
        pullRequest: { ...pull, state: 'merged' },
      }),
    ).toEqual({ _tag: 'Merged', pullRequest: pull });
    expect(
      missionStep(working, {
        agent: { status: 'idle' },
        pullRequest: { ...pull, state: 'closed' },
      }),
    ).toEqual({ _tag: 'Failed', reason: 'Pull request #12 was closed without merging.' });
  });

  it("waits while Claude's usage limit is reached, and goes on after it (spec 038)", () => {
    const limited = { agent: { status: 'working' }, pullRequest: undefined, limitedUntil: 5_000 };
    expect(missionStep(working, limited)).toEqual({
      _tag: 'Move',
      state: 'waiting',
      limitedUntil: 5_000,
    });
    const waiting = mission({ state: 'waiting', limitedUntil: 5_000 });
    expect(missionStep(waiting, limited)).toEqual({ _tag: 'Stay' });
    expect(
      missionStep(mission({ state: 'pull-request' }), {
        ...limited,
        pullRequest: { ...pull, state: 'open' },
      }),
    ).toEqual({ _tag: 'Move', state: 'waiting', limitedUntil: 5_000 });
    expect(missionStep(waiting, { agent: { status: 'working' }, pullRequest: undefined })).toEqual({
      _tag: 'Move',
      state: 'working',
      limitedUntil: undefined,
    });
    expect(
      missionStep(mission({ state: 'working', limitedUntil: 5_000 }), {
        agent: { status: 'working' },
        pullRequest: undefined,
      }),
    ).toEqual({ _tag: 'Move', state: 'working', limitedUntil: undefined });
  });

  it('is lost when its agent is gone, and stays lost', () => {
    expect(missionStep(working, { agent: undefined, pullRequest: undefined })).toEqual({
      _tag: 'Lost',
    });
    expect(
      missionStep(mission({ state: 'lost' }), {
        agent: { status: 'working' },
        pullRequest: undefined,
      }),
    ).toEqual({ _tag: 'Stay' });
  });
});

describe('the first prompt', () => {
  const input = {
    lane: 'hop' as const,
    issue: { number: 7, title: 'Fix the header', body: 'It overlaps.', url: 'http://gitea/7' },
    repository: { owner: 'smotastic', name: 'pocket-home' },
    continued: false,
  };

  it('names the flight rules, the lane, the mission rules and the issue', () => {
    const prompt = missionPrompt(input);
    expect(prompt).toContain('issue #7 of smotastic/pocket-home');
    expect(prompt).toContain('flight-rules');
    expect(prompt).toContain('This is a hop');
    expect(prompt).toContain('comms-mission');
    expect(prompt).toContain('comms-attach-pull-request');
    expect(prompt).toContain('Never deploy.');
    // Comms closes the agent once it sees the merge, so done is reported before it.
    expect(prompt).toContain('done right before the merge call');
    expect(prompt).toContain('Issue #7: Fix the header');
    expect(prompt).toContain('It overlaps.');
    expect(prompt).not.toContain('Continue from your branch');
  });

  it('names a full flight, and says to continue from the branch in a kept worktree', () => {
    const prompt = missionPrompt({ ...input, lane: 'full-flight', continued: true });
    expect(prompt).toContain('This is a full flight: flight-grill');
    expect(prompt).toContain('Continue from your branch');
  });
});

describe('deploy (spec 036)', () => {
  const file = (...missions: Array<Mission>) => ({ missions, seenAt: 0 });

  it('keeps releasing and deploying running, and the deploy endings finished', () => {
    expect(isRunning(mission({ state: 'releasing' }))).toBe(true);
    expect(isRunning(mission({ state: 'deploying' }))).toBe(true);
    for (const state of [
      'deployed',
      'rolled-back',
      'not-deployed',
      'nothing-to-release',
      'awaiting-deploy',
      'deploy-lost',
      'down',
    ] as const) {
      expect(isFinished(mission({ state }))).toBe(true);
    }
  });

  it('knows a planet that waits for the owner to deploy, oldest first', () => {
    const older = mission({ id: 'a', state: 'awaiting-deploy', finishedAt: 1 });
    const newer = mission({ id: 'b', state: 'awaiting-deploy', finishedAt: 2 });
    const other = mission({ id: 'c', planet: 'other', state: 'awaiting-deploy', finishedAt: 0 });
    expect(awaitingDeploy(file(newer, other, older), older.planet).map((each) => each.id)).toEqual([
      'a',
      'b',
    ]);
    expect(planetWaitsForOwner(file(older), older.planet)).toBe(true);
    expect(planetWaitsForOwner(file(other), older.planet)).toBe(false);
    const queuedByDeploy = mission({
      state: 'queued',
      deploy: { releases: [], step: 0, phase: 'tag', since: 0, backup: true, target: '' },
    });
    expect(planetWaitsForOwner(file(queuedByDeploy), queuedByDeploy.planet)).toBe(true);
  });

  it("names the planet's latest deploy, deployed or rolled back", () => {
    const deployed = mission({ id: 'a', state: 'deployed', finishedAt: 1 });
    const rolledBack = mission({ id: 'b', state: 'rolled-back', finishedAt: 2 });
    const merged = mission({ id: 'c', state: 'merged', finishedAt: 3 });
    expect(lastDeploy(file(deployed, rolledBack, merged), deployed.planet)?.id).toBe('b');
    expect(lastDeploy(file(merged), merged.planet)).toBeUndefined();
  });

  it('counts every failed release or deploy as a deploy failure, never an agent failure', () => {
    for (const state of ['rolled-back', 'down', 'deploy-lost'] as const) {
      expect(isDeployFailure(mission({ state }))).toBe(true);
    }
    expect(isDeployFailure(mission({ state: 'failed', versions: ['app-v0.2.0'] }))).toBe(true);
    expect(isDeployFailure(mission({ state: 'failed' }))).toBe(false);
    expect(isDeployFailure(mission({ state: 'deployed' }))).toBe(false);
  });

  it('knows the tags of failed releases and deploys as not released (issue 143)', () => {
    const failed = mission({ id: 'a', state: 'failed', versions: ['app-v0.3.1', 'web-v0.1.1'] });
    const rolledBack = mission({ id: 'b', state: 'rolled-back', versions: ['app-v0.3.2'] });
    const deployed = mission({ id: 'c', state: 'deployed', versions: ['app-v0.3.3'] });
    const other = mission({ id: 'd', planet: 'other', state: 'failed', versions: ['app-v0.9.0'] });
    expect([...unreleasedTags(file(failed, rolledBack, deployed, other), failed.planet)]).toEqual([
      'app-v0.3.1',
      'web-v0.1.1',
      'app-v0.3.2',
    ]);
    // web-v0.1.1 was refused; a later mission pushed and deployed it.
    const later = mission({ id: 'e', state: 'deployed', versions: ['web-v0.1.1'] });
    expect([...unreleasedTags(file(failed, later), failed.planet)]).toEqual(['app-v0.3.1']);
  });

  it('pauses the planet on its latest deploy failure until the owner resumes it (spec 037)', () => {
    const lost = mission({ id: 'a', state: 'deploy-lost', finishedAt: 2 });
    const agentFailed = mission({ id: 'b', state: 'failed', finishedAt: 3 });
    expect(pausingDeploy(file(lost, agentFailed), lost.planet)?.id).toBe('a');
    expect(pausingDeploy(file({ ...lost, resumedAt: 4 }), lost.planet)).toBeUndefined();
    const later = mission({ id: 'c', state: 'deployed', finishedAt: 5 });
    expect(pausingDeploy(file(lost, later), lost.planet)).toBeUndefined();
    const releaseFailed = mission({ id: 'd', state: 'failed', versions: [], finishedAt: 6 });
    expect(pausingDeploy(file(later, releaseFailed), lost.planet)?.id).toBe('d');
  });

  it('words a down planet as urgent', () => {
    expect(failureWords('down', 'pocket-lens').title).toBe(
      'pocket-lens is down: deploy and rollback failed',
    );
    expect(failureWords('deploy-lost', 'pocket-lens').next).toContain('by hand');
  });
});
