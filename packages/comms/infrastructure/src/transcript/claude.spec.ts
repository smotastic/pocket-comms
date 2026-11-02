import { describe, expect, it } from '@effect/vitest';
import { readFileSync } from 'node:fs';
import { claudeSessionPath, createClaudeParser } from './claude.js';

const fixture = readFileSync(
  new URL('../testing/fixtures/claude-session.jsonl', import.meta.url),
  'utf8',
).split('\n');

const at = (second: number) => Date.parse(`2026-10-30T15:17:${String(second).padStart(2, '0')}Z`);

describe('createClaudeParser', () => {
  it('turns a Claude session into chat entries', () => {
    const parser = createClaudeParser('/work/app');
    fixture.forEach((line) => parser.push(line));

    expect(parser.entries()).toEqual([
      { type: 'user', id: 'u-1', at: at(1), text: 'Fix the failing test in src/a.ts' },
      { type: 'assistant', id: 'a-1:0', at: at(4), text: "I'll fix **it**." },
      {
        type: 'tool',
        id: 'toolu-edit',
        at: at(5),
        verb: 'Edited',
        target: 'src/a.ts',
        added: 2,
        removed: 1,
        outcome: 'ok',
      },
      {
        type: 'tool',
        id: 'toolu-bash',
        at: at(7),
        verb: 'Ran',
        target: 'pnpm test',
        outcome: 'error',
      },
      {
        type: 'tool',
        id: 'toolu-read',
        at: at(9),
        verb: 'Read',
        target: '/elsewhere/b.ts',
        outcome: 'ok',
      },
      { type: 'assistant', id: 'a-5:0', at: at(13), text: 'Fixed. Running the build.' },
      {
        type: 'tool',
        id: 'toolu-build',
        at: at(14),
        verb: 'Ran',
        target: 'pnpm build \\ …',
        outcome: 'pending',
      },
    ]);
  });

  it('returns the entries a line adds or changes', () => {
    const parser = createClaudeParser('/work/app');
    const lines = fixture.slice(0, 6);
    lines.forEach((line) => parser.push(line));

    const changed = parser.push(fixture[6] ?? '');

    expect(changed).toEqual([
      expect.objectContaining({ id: 'toolu-edit', outcome: 'ok', added: 2 }),
    ]);
  });

  it('skips a line that is no JSON, such as one cut off while it is written', () => {
    const parser = createClaudeParser('/work/app');

    expect(parser.push('{"type":"user","mess')).toEqual([]);
    expect(parser.push('')).toEqual([]);
  });

  it('skips the summary Claude writes when it compacts the conversation', () => {
    const parser = createClaudeParser('/work/app');

    const changed = parser.push(
      JSON.stringify({
        type: 'user',
        isSidechain: false,
        isCompactSummary: true,
        isVisibleInTranscriptOnly: true,
        uuid: 'u-summary',
        timestamp: '2026-10-30T15:17:01Z',
        message: {
          role: 'user',
          content: 'This session is being continued from a previous conversation…',
        },
      }),
    );

    expect(changed).toEqual([]);
    expect(parser.entries()).toEqual([]);
  });

  it.each([
    [
      'Write',
      { file_path: '/work/app/new.ts', content: 'a\nb\nc' },
      { verb: 'Wrote', target: 'new.ts', added: 3 },
    ],
    ['Grep', { pattern: 'TODO' }, { verb: 'Searched', target: 'TODO' }],
    ['Glob', { pattern: '**/*.ts' }, { verb: 'Searched', target: '**/*.ts' }],
    ['WebSearch', { query: 'effect streams' }, { verb: 'Searched', target: 'effect streams' }],
    [
      'WebFetch',
      { url: 'https://effect.website' },
      { verb: 'Fetched', target: 'https://effect.website' },
    ],
    ['Agent', { description: 'Review the diff' }, { verb: 'Delegated', target: 'Review the diff' }],
    ['Skill', { skill: 'code-review' }, { verb: 'Used', target: 'code-review' }],
    ['TodoWrite', { todos: [] }, { verb: 'Used', target: 'TodoWrite' }],
  ] as const)('summarises a %s call', (name, input, summary) => {
    const parser = createClaudeParser('/work/app');

    const [entry] = parser.push(
      JSON.stringify({
        type: 'assistant',
        isSidechain: false,
        uuid: 'a',
        timestamp: '2026-10-30T15:17:01Z',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 't', name, input }] },
      }),
    );

    expect(entry).toMatchObject({ type: 'tool', outcome: 'pending', ...summary });
  });
});

describe('createClaudeParser with AskUserQuestion', () => {
  const questions = [
    {
      question: 'Keep Effect?',
      header: 'Stack',
      options: [{ label: 'Keep Effect' }, { label: 'Drop it' }],
      multiSelect: false,
    },
    {
      question: 'Which projects?',
      header: 'Projects',
      options: [{ label: 'Backend' }, { label: 'Web' }],
      multiSelect: true,
    },
  ];
  const asked = JSON.stringify({
    type: 'assistant',
    uuid: 'a-q',
    timestamp: '2026-10-30T15:17:01Z',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu-q', name: 'AskUserQuestion', input: { questions } }],
    },
  });
  const result = (block: Record<string, unknown>, toolUseResult?: unknown) =>
    JSON.stringify({
      type: 'user',
      uuid: 'u-q',
      timestamp: '2026-10-30T15:17:09Z',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu-q', ...block }],
      },
      ...(toolUseResult === undefined ? {} : { toolUseResult }),
    });
  const waiting = [
    { header: 'Stack', text: 'Keep Effect?' },
    { header: 'Projects', text: 'Which projects?' },
  ];

  it('carries the questions while the owner has not answered', () => {
    const parser = createClaudeParser('/work/app');

    expect(parser.push(asked)).toEqual([
      {
        type: 'tool',
        id: 'toolu-q',
        at: Date.parse('2026-10-30T15:17:01Z'),
        verb: 'Used',
        target: 'AskUserQuestion',
        questions: waiting,
        outcome: 'pending',
      },
    ]);
  });

  it('carries each chosen answer, several joined and typed ones as typed', () => {
    const parser = createClaudeParser('/work/app');
    parser.push(asked);

    const changed = parser.push(
      result(
        { content: 'The user answered: …' },
        {
          questions,
          answers: { 'Keep Effect?': 'my own idea', 'Which projects?': 'Backend, Web' },
        },
      ),
    );

    expect(changed).toEqual([
      expect.objectContaining({
        outcome: 'ok',
        questions: [
          { header: 'Stack', text: 'Keep Effect?', answer: 'my own idea' },
          { header: 'Projects', text: 'Which projects?', answer: 'Backend, Web' },
        ],
      }),
    ]);
  });

  it('fails the call without answers when the owner declines', () => {
    const parser = createClaudeParser('/work/app');
    parser.push(asked);

    parser.push(result({ content: 'The user declined.', is_error: true }));

    expect(parser.entries()).toEqual([
      expect.objectContaining({ outcome: 'error', questions: waiting }),
    ]);
  });

  it('is a plain tool line when no question can be read', () => {
    const parser = createClaudeParser('/work/app');

    const [entry] = parser.push(asked.replace('"questions":', '"other":'));

    expect(entry).toEqual(expect.not.objectContaining({ questions: expect.anything() }));
    expect(entry).toMatchObject({ verb: 'Used', target: 'AskUserQuestion' });
  });

  it('finishes a call whose result names no answers', () => {
    const parser = createClaudeParser('/work/app');
    parser.push(asked);

    parser.push(result({ content: 'Answered.' }));

    expect(parser.entries()).toEqual([
      expect.objectContaining({ outcome: 'ok', questions: waiting }),
    ]);
  });
});

describe('claudeSessionPath', () => {
  it('names the session file under the project folder of the working directory', () => {
    expect(claudeSessionPath('/home/me', '/Users/me/.herdr/worktrees/app', 'abc')).toBe(
      '/home/me/.claude/projects/-Users-me--herdr-worktrees-app/abc.jsonl',
    );
  });
});
