import { describe, expect, it } from 'vitest';
import type { TranscriptView } from './comms-client.js';
import { mergeEntries } from './live.js';

const user = { type: 'user', id: 'u1', at: 1, text: 'Run the tests' } as const;
const pending = {
  type: 'tool',
  id: 't1',
  at: 2,
  verb: 'Ran',
  target: 'pnpm test',
  outcome: 'pending',
} as const;
const done = { ...pending, outcome: 'ok' } as const;
const reply = { type: 'assistant', id: 'a1', at: 3, text: 'Green.' } as const;

describe('mergeEntries', () => {
  const held: TranscriptView = { entries: [user, pending], activity: 'Running pnpm test…' };

  it('replaces what it holds on a reset', () => {
    expect(
      mergeEntries(held, { type: 'entries', reset: true, entries: [reply], activity: 'Thinking…' }),
    ).toEqual({ entries: [reply], activity: 'Thinking…' });
  });

  it('updates a changed entry in place and appends a new one', () => {
    expect(
      mergeEntries(held, {
        type: 'entries',
        reset: false,
        entries: [done, reply],
        activity: 'Thinking…',
      }),
    ).toEqual({ entries: [user, done, reply], activity: 'Thinking…' });
  });

  it('starts from nothing when it holds nothing', () => {
    expect(
      mergeEntries(undefined, {
        type: 'entries',
        reset: false,
        entries: [user],
        activity: 'Thinking…',
      }),
    ).toEqual({ entries: [user], activity: 'Thinking…' });
  });
});
