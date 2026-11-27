import { describe, expect, it } from '@effect/vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleStatus, limitedUntil } from './usage-status.js';

const status = (fiveHour: number, sevenDay: number) => ({
  session_id: 'f1bfcb38-fb5d-44d9',
  model: { display_name: 'Opus' },
  rate_limits: {
    five_hour: { used_percentage: fiveHour, resets_at: 1_795_800_000 },
    seven_day: { used_percentage: sevenDay, resets_at: 1_796_000_000 },
  },
});

describe('the mission status line (spec 038)', () => {
  it('finds the latest reset of a reached limit', () => {
    expect(limitedUntil(status(42, 10))).toBeUndefined();
    expect(limitedUntil(status(100, 10))).toBe(1_795_800_000);
    expect(limitedUntil(status(100, 100.5))).toBe(1_796_000_000);
    expect(limitedUntil({})).toBeUndefined();
  });

  it('keeps the limit of its conversation for the server, and removes it after', () => {
    const folder = join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'limits');
    const path = join(folder, 'f1bfcb38-fb5d-44d9.json');

    expect(handleStatus(JSON.stringify(status(100, 10)), folder)).toBe(
      'mission · Opus · 5h 100% · 7d 10%',
    );
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ until: 1_795_800_000 });

    handleStatus(JSON.stringify(status(3, 10)), folder);
    expect(existsSync(path)).toBe(false);
  });

  it('changes nothing for input that does not read, or a session id that is not one', () => {
    const folder = join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'limits');
    expect(handleStatus('not json', folder)).toBe('mission');
    handleStatus(JSON.stringify({ ...status(100, 0), session_id: '../escape' }), folder);
    expect(existsSync(folder)).toBe(false);
  });
});
