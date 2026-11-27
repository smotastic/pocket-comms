import { describe, expect, it } from '@effect/vitest';
import { MissionsOutbound } from '@pocket-comms/comms-application';
import { EMPTY_MISSIONS, type MissionsFile } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFile } from './file-store.js';

const folder = () => join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'state');

const store = (path: string) => MissionsOutbound.pipe(Effect.provide(layerFile({ folder: path })));

const file: MissionsFile = {
  seenAt: 5,
  missions: [
    {
      id: 'm1',
      planet: 'pocket-home',
      repository: { owner: 'smotastic', name: 'pocket-home' },
      issue: { number: 7, title: 'Fix the header', url: 'http://gitea/7' },
      lane: 'hop',
      state: 'merged',
      sentAt: 1,
      startedAt: 2,
      finishedAt: 3,
      worktree: { path: '/w/fix-7', branch: 'fix/7-header', workspaceId: '/w/fix-7' },
      agent: 'fix-7-header',
      session: 's1',
      pullRequest: { number: 12, url: 'http://gitea/pulls/12' },
      outcome: 'Fixed the header.',
    },
    {
      id: 'm2',
      planet: 'pocket-lens',
      repository: { owner: 'smotastic', name: 'pocket-lens' },
      issue: { number: 3, title: 'Albums', url: 'http://gitea/3' },
      lane: 'full-flight',
      state: 'queued',
      sentAt: 4,
    },
    {
      id: 'm3',
      planet: 'pocket-lens',
      repository: { owner: 'smotastic', name: 'pocket-lens' },
      issue: { number: 38, title: 'Exposure', url: 'http://gitea/38' },
      lane: 'hop',
      state: 'releasing',
      sentAt: 5,
      startedAt: 6,
      pullRequest: { number: 40, url: 'http://gitea/pulls/40' },
      deploy: {
        releases: [
          {
            tag: 'lens-v0.11.1',
            version: '0.11.1',
            workflow: 'release-lens.yml',
            app: 'pocket-lens',
          },
        ],
        step: 0,
        phase: 'deploy',
        since: 7,
        backup: false,
        job: 'job-1',
        pid: 4242,
        target: 'd5ff0d5',
      },
    },
    {
      id: 'm4',
      planet: 'pocket-coach',
      repository: { owner: 'smotastic', name: 'pocket-coach' },
      issue: { number: 9, title: 'Plans', url: 'http://gitea/9' },
      lane: 'hop',
      state: 'rolled-back',
      sentAt: 8,
      finishedAt: 9,
      versions: ['coach-web-v0.3.0', 'coach-v0.14.1'],
      // Issue 144: the first deploy stays when the second rolls back.
      releases: [
        { tag: 'coach-web-v0.3.0', outcome: 'deployed' },
        { tag: 'coach-v0.14.1', outcome: 'rolled-back' },
      ],
      output: 'The health check failed.',
      fixIssue: 41,
      resumedAt: 10,
      autopilot: true,
    },
    {
      id: 'm7',
      planet: 'pocket-lens',
      repository: { owner: 'smotastic', name: 'pocket-lens' },
      issue: { number: 12, title: 'Limited', url: 'http://gitea/12' },
      lane: 'hop',
      state: 'waiting',
      sentAt: 12,
      autopilot: true,
      limitedUntil: 13,
    },
    {
      id: 'm6',
      planet: 'pocket-lens',
      repository: { owner: 'smotastic', name: 'pocket-lens' },
      issue: { number: 11, title: 'Lost', url: 'http://gitea/11' },
      lane: 'hop',
      state: 'deploy-lost',
      sentAt: 12,
      finishedAt: 13,
    },
    {
      id: 'm7',
      planet: 'pocket-lens',
      repository: { owner: 'smotastic', name: 'pocket-lens' },
      issue: { number: 12, title: 'Down', url: 'http://gitea/12' },
      lane: 'hop',
      state: 'down',
      sentAt: 14,
      finishedAt: 15,
    },
    {
      id: 'm8',
      planet: 'pocket-lens',
      repository: { owner: 'smotastic', name: 'pocket-lens' },
      issue: { number: 13, title: 'CI', url: 'http://gitea/13' },
      lane: 'hop',
      state: 'releasing',
      sentAt: 16,
      deploy: { releases: [], step: 0, phase: 'ci', since: 17, backup: false, target: 'abc' },
    },
    {
      id: 'm5',
      planet: 'pocket-coach',
      repository: { owner: 'smotastic', name: 'pocket-coach' },
      issue: { number: 10, title: 'Sessions', url: 'http://gitea/10' },
      lane: 'hop',
      state: 'awaiting-deploy',
      sentAt: 10,
      finishedAt: 11,
      deployWith: 'm4',
    },
  ],
};

describe('the missions file store', () => {
  it.effect('has no missions before the first save', () =>
    Effect.gen(function* () {
      expect(yield* (yield* store(folder())).load).toEqual(EMPTY_MISSIONS);
    }),
  );

  it.effect('loads what it saved, also after a restart, readable by the owner only', () =>
    Effect.gen(function* () {
      const path = folder();
      yield* (yield* store(path)).save(file);

      expect(yield* (yield* store(path)).load).toEqual(file);
      expect(statSync(join(path, 'missions.json')).mode & 0o777).toBe(0o600);
    }),
  );

  it.effect('keeps an unreadable file as .bad and has no missions', () =>
    Effect.gen(function* () {
      const path = folder();
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'missions.json'), '{"version":9}');

      expect(yield* (yield* store(path)).load).toEqual(EMPTY_MISSIONS);
      expect(existsSync(join(path, 'missions.json.bad'))).toBe(true);
    }),
  );
});
