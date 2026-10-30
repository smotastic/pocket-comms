import { describe, expect, it } from '@effect/vitest';
import { activityOf, type TranscriptEntry } from './transcript.js';

const at = 1_793_391_381_245;
const user: TranscriptEntry = { type: 'user', id: 'u1', at, text: 'Run the tests' };
const reply: TranscriptEntry = { type: 'assistant', id: 'a1', at, text: 'On it.' };
const tool = (
  verb: Extract<TranscriptEntry, { type: 'tool' }>['verb'],
  outcome: 'ok' | 'error' | 'pending',
  target?: string,
): TranscriptEntry => ({ type: 'tool', id: `t-${verb}`, at, verb, target, outcome });

describe('activityOf', () => {
  it('names a pending command as running', () => {
    expect(activityOf([user, reply, tool('Ran', 'pending', 'pnpm test')])).toBe(
      'Running pnpm test…',
    );
  });

  it.each([
    ['Edited', 'Editing src/a.ts…'],
    ['Wrote', 'Writing src/a.ts…'],
    ['Read', 'Reading src/a.ts…'],
    ['Searched', 'Searching src/a.ts…'],
    ['Fetched', 'Fetching src/a.ts…'],
    ['Delegated', 'Delegating src/a.ts…'],
    ['Used', 'Using src/a.ts…'],
  ] as const)('names a pending %s step in the present tense', (verb, label) => {
    expect(activityOf([tool(verb, 'pending', 'src/a.ts')])).toBe(label);
  });

  it('leaves out a missing target', () => {
    expect(activityOf([tool('Used', 'pending')])).toBe('Using…');
  });

  it('is thinking when the latest entry is a finished step', () => {
    expect(activityOf([user, tool('Ran', 'ok', 'pnpm test')])).toBe('Thinking…');
  });

  it('is thinking when nothing was written yet', () => {
    expect(activityOf([])).toBe('Thinking…');
  });
});
