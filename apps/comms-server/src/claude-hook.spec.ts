import { describe, expect, it } from '@effect/vitest';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleHook, questionsFolder } from './claude-hook.js';

const folder = () => join(mkdtempSync(join(tmpdir(), 'comms-hook-')), 'questions');

const questions = [
  { question: 'Pick a color?', header: 'Color', options: [{ label: 'Red' }], multiSelect: false },
];

const event = (name: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    session_id: 'f5aa78c9-3c68-4cc8-8166-f45867f5d00f',
    cwd: '/work/app',
    hook_event_name: name,
    ...extra,
  });

const asked = event('PreToolUse', {
  tool_name: 'AskUserQuestion',
  tool_use_id: 'toolu_1',
  tool_input: { questions },
});

const fileOf = (path: string) => join(path, 'f5aa78c9-3c68-4cc8-8166-f45867f5d00f.json');

describe('the Claude hook', () => {
  it('keeps the waiting call of a session, readable by the owner only', () => {
    const path = folder();

    handleHook(asked, path);

    expect(JSON.parse(readFileSync(fileOf(path), 'utf8'))).toEqual({
      session: 'f5aa78c9-3c68-4cc8-8166-f45867f5d00f',
      cwd: '/work/app',
      call: 'toolu_1',
      input: { questions },
    });
    expect(statSync(fileOf(path)).mode & 0o777).toBe(0o600);
  });

  it.each([
    ['an answer', event('PostToolUse', { tool_name: 'AskUserQuestion', tool_use_id: 'toolu_1' })],
    ['the end of the turn', event('Stop')],
  ])('forgets the call after %s', (_, input) => {
    const path = folder();
    handleHook(asked, path);

    handleHook(input, path);

    expect(existsSync(fileOf(path))).toBe(false);
  });

  it('forgets nothing when the session never asked', () => {
    expect(() => handleHook(event('Stop'), folder())).not.toThrow();
  });

  it.each([
    ['input that is not JSON', '{"session_id":'],
    ['another tool', event('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_2' })],
    [
      'a session id that is not a plain id',
      JSON.stringify({ ...JSON.parse(asked), session_id: '../escape' }),
    ],
    ['a call without an id', JSON.stringify({ ...JSON.parse(asked), tool_use_id: undefined })],
  ])('writes nothing for %s', (_, input) => {
    const path = folder();

    handleHook(input, path);

    expect(existsSync(path)).toBe(false);
  });

  it('keeps the calls in the server state folder', () => {
    expect(questionsFolder({ COMMS_STATE_DIR: '/srv/state' }, '/home/me')).toBe(
      '/srv/state/questions',
    );
    expect(questionsFolder({}, '/home/me')).toBe('/home/me/.pocket-comms/questions');
  });
});
