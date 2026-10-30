import { describe, expect, it } from '@effect/vitest';
import { readFileSync } from 'node:fs';
import { createPiParser, piSessionFolder } from './pi.js';

const fixture = readFileSync(
  new URL('../testing/fixtures/pi-session.jsonl', import.meta.url),
  'utf8',
).split('\n');

const at = (second: number) => Date.parse(`2026-10-30T20:16:${String(second).padStart(2, '0')}Z`);

describe('createPiParser', () => {
  it('turns a Pi session into chat entries', () => {
    const parser = createPiParser('/work/app');
    fixture.forEach((line) => parser.push(line));

    expect(parser.entries()).toEqual([
      { type: 'user', id: 'p-1', at: at(3), text: 'Port the chat kit' },
      { type: 'tool', id: 'call-read', at: at(4), verb: 'Read', target: 'brief.md', outcome: 'ok' },
      {
        type: 'tool',
        id: 'call-edit',
        at: at(6),
        verb: 'Edited',
        target: 'src/index.ts',
        added: 2,
        removed: 1,
        outcome: 'ok',
      },
      {
        type: 'tool',
        id: 'call-bash',
        at: at(8),
        verb: 'Ran',
        target: 'pnpm nx test design-ui',
        outcome: 'error',
      },
      {
        type: 'assistant',
        id: 'p-8:0',
        at: at(10),
        text: 'The tests fail; I left the changes in the worktree.',
      },
    ]);
  });

  it('returns the tool call a result finishes', () => {
    const parser = createPiParser('/work/app');
    fixture.slice(0, 8).forEach((line) => parser.push(line));
    parser.push(fixture[8] ?? '');

    expect(parser.push(fixture[9] ?? '')).toEqual([
      expect.objectContaining({ id: 'call-bash', outcome: 'error' }),
    ]);
  });

  it.each([
    [
      'write',
      { path: '/work/app/a.ts', content: 'x\ny' },
      { verb: 'Wrote', target: 'a.ts', added: 2 },
    ],
    ['grep', { pattern: 'TODO' }, { verb: 'Searched', target: 'TODO' }],
    ['find', { pattern: '*.ts' }, { verb: 'Searched', target: '*.ts' }],
    ['ls', { path: '/work/app/src' }, { verb: 'Searched', target: 'src' }],
    ['subagent', { task: 'x' }, { verb: 'Used', target: 'subagent' }],
  ] as const)('summarises a %s call', (name, args, summary) => {
    const parser = createPiParser('/work/app');

    const [entry] = parser.push(
      JSON.stringify({
        type: 'message',
        id: 'm',
        timestamp: '2026-10-30T20:16:01Z',
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'c', name, arguments: args }],
        },
      }),
    );

    expect(entry).toMatchObject({ type: 'tool', outcome: 'pending', ...summary });
  });
});

describe('piSessionFolder', () => {
  it('names the session folder of the working directory', () => {
    expect(piSessionFolder('/home/me', '/Users/me/.herdr/worktrees/app')).toBe(
      '/home/me/.pi/agent/sessions/--Users-me-.herdr-worktrees-app--',
    );
  });
});
