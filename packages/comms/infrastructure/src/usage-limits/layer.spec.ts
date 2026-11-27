import { describe, expect, it } from '@effect/vitest';
import { UsageLimitsOutbound } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layer } from './layer.js';

const limitsOf = (stateDir: string) =>
  UsageLimitsOutbound.use((outbound) => outbound.limits).pipe(Effect.provide(layer({ stateDir })));

describe('the usage limits (spec 038)', () => {
  it.effect('has none without the folder', () =>
    Effect.gen(function* () {
      const stateDir = mkdtempSync(join(tmpdir(), 'comms-state-'));
      expect((yield* limitsOf(stateDir)).size).toBe(0);
    }),
  );

  it.effect(
    'reads each conversation reset time in milliseconds, and skips what does not read',
    () =>
      Effect.gen(function* () {
        const stateDir = mkdtempSync(join(tmpdir(), 'comms-state-'));
        const folder = join(stateDir, 'limits');
        mkdirSync(folder);
        writeFileSync(join(folder, 'f1bfcb38-fb5d.json'), '{"until":1795800000}');
        writeFileSync(join(folder, 'broken.json'), 'not json');
        writeFileSync(join(folder, 'zero.json'), '{"until":0}');
        writeFileSync(join(folder, 'notes.txt'), '{"until":5}');

        expect([...(yield* limitsOf(stateDir))]).toEqual([['f1bfcb38-fb5d', 1_795_800_000_000]]);
      }),
  );
});
