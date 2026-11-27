import { describe, expect, it } from '@effect/vitest';
import { AutopilotOutbound } from '@pocket-comms/comms-application';
import { EMPTY_AUTOPILOT, type AutopilotFile } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFile } from './file-store.js';

const folder = () => join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'state');

const store = (path: string) => AutopilotOutbound.pipe(Effect.provide(layerFile({ folder: path })));

const file: AutopilotFile = {
  settings: { enabled: false, start: '22:30', end: '06:00', budget: 3 },
  triaged: [{ planet: 'pocket-lens', number: 38, hash: '0a1b2c3d', verdict: 'hop' }],
  night: {
    window: '2026-11-27',
    triaged: true,
    triage: [
      {
        planet: 'pocket-lens',
        verdicts: [
          {
            number: 38,
            title: 'Exposure',
            url: 'http://gitea/38',
            verdict: 'not-ready',
            reason: 'Unclear.',
          },
        ],
      },
      { planet: 'pocket-coach', verdicts: [], skipped: 'Pi is not set up.' },
    ],
    sent: ['m1', 'm2'],
    endings: [{ id: 'm1', failed: true }],
    stopped: 'two missions in a row failed.',
    summarySent: false,
  },
};

describe('the Autopilot file store (spec 038)', () => {
  it.effect('has the defaults before the first save', () =>
    Effect.gen(function* () {
      expect(yield* (yield* store(folder())).load).toEqual(EMPTY_AUTOPILOT);
    }),
  );

  it.effect('loads what it saved, also after a restart, readable by the owner only', () =>
    Effect.gen(function* () {
      const path = folder();
      yield* (yield* store(path)).save(file);

      expect(yield* (yield* store(path)).load).toEqual(file);
      expect(statSync(join(path, 'autopilot.json')).mode & 0o777).toBe(0o600);
    }),
  );

  it.effect('keeps an unreadable file as .bad and has the defaults', () =>
    Effect.gen(function* () {
      const path = folder();
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'autopilot.json'), '{"version":9}');

      expect(yield* (yield* store(path)).load).toEqual(EMPTY_AUTOPILOT);
      expect(existsSync(join(path, 'autopilot.json.bad'))).toBe(true);
    }),
  );
});
