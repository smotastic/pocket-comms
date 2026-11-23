import { describe, expect, it } from '@effect/vitest';
import { PullRequestsOutbound, PullRequestsStoreError } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFile } from './file-store.js';

const folder = () => join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'state');

const store = (path: string) =>
  PullRequestsOutbound.pipe(Effect.provide(layerFile({ folder: path })));

const lists = {
  'session-1': [
    { owner: 'smotastic', name: 'pocket-comms', number: 99, attachedAt: 1 },
    { owner: 'smotastic', name: 'pocket-factory', number: 3, attachedAt: 2 },
  ],
};

describe('the attached pull requests file store', () => {
  it.effect('loads no lists before the first save', () =>
    Effect.gen(function* () {
      expect(yield* (yield* store(folder())).load).toEqual({});
    }),
  );

  it.effect('loads what it saved, in a new folder, also after a restart', () =>
    Effect.gen(function* () {
      const path = folder();
      yield* (yield* store(path)).save({ other: [] });
      yield* (yield* store(path)).save(lists);

      expect(yield* (yield* store(path)).load).toEqual(lists);
      expect(JSON.parse(readFileSync(join(path, 'pull-requests.json'), 'utf-8'))).toEqual({
        version: 1,
        agents: lists,
      });
      expect(statSync(join(path, 'pull-requests.json')).mode & 0o777).toBe(0o600);
    }),
  );

  it.effect('reports a file that does not read and leaves it alone', () =>
    Effect.gen(function* () {
      const path = folder();
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'pull-requests.json'), '{"version":9}');

      const error = yield* (yield* store(path)).load.pipe(Effect.flip);

      expect(error).toBeInstanceOf(PullRequestsStoreError);
      expect(readFileSync(join(path, 'pull-requests.json'), 'utf-8')).toBe('{"version":9}');
    }),
  );
});
