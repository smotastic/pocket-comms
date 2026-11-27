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
