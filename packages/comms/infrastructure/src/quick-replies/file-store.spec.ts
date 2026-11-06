import { describe, expect, it } from '@effect/vitest';
import { QuickRepliesOutbound, QuickRepliesStoreError } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFile } from './file-store.js';

const folder = () => join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'state');

const store = (path: string) =>
  QuickRepliesOutbound.pipe(Effect.provide(layerFile({ folder: path })));

describe('the quick replies file store', () => {
  it.effect('loads nothing before the first save', () =>
    Effect.gen(function* () {
      expect(yield* (yield* store(folder())).load).toEqual(Option.none());
    }),
  );

  it.effect('loads what it saved, in a new folder, also after a restart', () =>
    Effect.gen(function* () {
      const path = folder();
      yield* (yield* store(path)).save(['Run the tests first', 'Go ahead']);
      yield* (yield* store(path)).save(['Go ahead', 'Run the tests first']);

      expect(yield* (yield* store(path)).load).toEqual(
        Option.some(['Go ahead', 'Run the tests first']),
      );
      expect(JSON.parse(readFileSync(join(path, 'quick-replies.json'), 'utf-8'))).toEqual({
        version: 1,
        replies: ['Go ahead', 'Run the tests first'],
      });
    }),
  );

  it.effect('keeps an empty list apart from no list', () =>
    Effect.gen(function* () {
      const path = folder();
      yield* (yield* store(path)).save([]);

      expect(yield* (yield* store(path)).load).toEqual(Option.some([]));
    }),
  );

  it.effect('reports a file that does not read and leaves it alone', () =>
    Effect.gen(function* () {
      const path = folder();
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'quick-replies.json'), '{"version":9}');

      const error = yield* (yield* store(path)).load.pipe(Effect.flip);

      expect(error).toBeInstanceOf(QuickRepliesStoreError);
      expect(readFileSync(join(path, 'quick-replies.json'), 'utf-8')).toBe('{"version":9}');
    }),
  );
});
