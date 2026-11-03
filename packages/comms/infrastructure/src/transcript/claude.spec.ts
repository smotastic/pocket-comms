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

describe('createClaudeParser with attached images', () => {
  const IMAGES = '/home/me/.pocket-comms/images';
  // Claude shows each image path of a prompt as a marker, and names its file on a meta line.
  const prompt = (text: string, images = 1) =>
    JSON.stringify({
      type: 'user',
      uuid: 'u-img',
      timestamp: '2026-10-30T15:17:01Z',
      origin: { kind: 'human' },
      message: {
        role: 'user',
        content: [
          { type: 'text', text },
          ...Array.from({ length: images }, () => ({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/' },
          })),
        ],
      },
    });
  const sources = (...paths: ReadonlyArray<string>) =>
    JSON.stringify({
      type: 'user',
      isMeta: true,
      uuid: 'u-src',
      timestamp: '2026-10-30T15:17:01Z',
      message: {
        role: 'user',
        content: paths.map((path) => ({ type: 'text', text: `[Image: source: ${path}]` })),
      },
    });
  const user = (text: string) => ({
    type: 'user',
    id: 'u-img',
    at: Date.parse('2026-10-30T15:17:01Z'),
    text,
  });

  it('puts the image paths back in place of the markers', () => {
    const parser = createClaudeParser('/work/app');
    parser.push(prompt('[Image #1][Image #2] Why is this red?', 2));

    const changed = parser.push(sources(`${IMAGES}/a.jpg`, `${IMAGES}/b.png`));

    const text = `Why is this red?\n\n${IMAGES}/a.jpg\n${IMAGES}/b.png`;
    expect(changed).toEqual([user(text)]);
    expect(parser.entries()).toEqual([user(text)]);
  });

  it('takes the paths of several meta lines', () => {
    const parser = createClaudeParser('/work/app');
    parser.push(prompt('[Image #1][Image #2]', 2));
    parser.push(sources(`${IMAGES}/a.jpg`));
    parser.push(sources(`${IMAGES}/b.png`));

    expect(parser.entries()).toEqual([user(`${IMAGES}/a.jpg\n${IMAGES}/b.png`)]);
  });

  it('keeps the markers while no meta line names the files', () => {
    const parser = createClaudeParser('/work/app');

    parser.push(prompt('[Image #1]Look'));

    expect(parser.entries()).toEqual([user('[Image #1]Look')]);
  });

  it('keeps a meta line that is no image source out of the chat', () => {
    const parser = createClaudeParser('/work/app');
    parser.push(prompt('[Image #1]Look'));

    const changed = parser.push(sources('/a.jpg').replace('[Image: source: ', '[Note: '));

    expect(changed).toEqual([]);
    expect(parser.entries()).toEqual([user('[Image #1]Look')]);
  });

  it('names no image for a meta line after an entry that is not a prompt', () => {
    const parser = createClaudeParser('/work/app');

    expect(parser.push(sources(`${IMAGES}/a.jpg`))).toEqual([]);
    expect(parser.entries()).toEqual([]);
  });
});

const lines = (name: string) =>
  readFileSync(new URL(`../testing/fixtures/${name}`, import.meta.url), 'utf8').split('\n');

const background = lines('claude-background.jsonl');
const bgAt = (second: number) => Date.parse(`2026-10-30T16:00:${String(second).padStart(2, '0')}Z`);

describe('createClaudeParser background work', () => {
  const after = (count: number) => {
    const parser = createClaudeParser('/work/app');
    background.slice(0, count).forEach((line) => parser.push(line));
    return parser;
  };

  it('tracks shells, monitors and subagents from their start', () => {
    expect(after(8).background()).toEqual([
      {
        id: 'toolu-ci',
        kind: 'shell',
        description: 'Wait for CI',
        startedAt: bgAt(2),
        inBackground: true,
      },
      {
        id: 'toolu-mon',
        kind: 'monitor',
        description: 'Watch the server log',
        startedAt: bgAt(4),
        inBackground: true,
        expiresAt: bgAt(5) + 10 * 60_000,
      },
      {
        id: 'toolu-rev',
        kind: 'subagent',
        description: 'Review the diff',
        startedAt: bgAt(6),
        inBackground: true,
        subagent: 'a0123456789abcdef',
      },
      {
        id: 'toolu-fg',
        kind: 'subagent',
        description: 'Find the config',
        startedAt: bgAt(8),
        inBackground: false,
      },
    ]);
  });

  it('counts a shell only once Claude reports it runs in the background', () => {
    expect(after(2).background()).toEqual([]);
  });

  it('ends work on its notification, a returned subagent and a stopped task', () => {
    const parser = after(background.length);

    expect(parser.background().map((item) => item.id)).toEqual(['toolu-rev']);
  });

  it('ends work as soon as its notification is queued', () => {
    expect(
      after(8)
        .background()
        .map((item) => item.id),
    ).toContain('toolu-ci');
    expect(
      after(9)
        .background()
        .map((item) => item.id),
    ).not.toContain('toolu-ci');
  });

  it('ends work on a notification that arrived as an attachment during a turn', () => {
    const parser = after(3);
    parser.push(
      JSON.stringify({
        type: 'attachment',
        isSidechain: false,
        uuid: 'at-1',
        timestamp: '2026-10-30T16:00:30.000Z',
        attachment: {
          type: 'queued_command',
          commandMode: 'task-notification',
          prompt:
            '<task-notification>\n<task-id>bci1</task-id>\n<status>completed</status>\n</task-notification>',
        },
      }),
    );

    expect(parser.background()).toEqual([]);
  });

  it('ends nothing on an attachment that is no notification', () => {
    const parser = after(3);
    parser.push(
      JSON.stringify({
        type: 'attachment',
        uuid: 'at-2',
        timestamp: '2026-10-30T16:00:30.000Z',
        attachment: {
          type: 'queued_command',
          commandMode: 'prompt',
          prompt: '<task-id>bci1</task-id>',
        },
      }),
    );

    expect(parser.background().map((item) => item.id)).toEqual(['toolu-ci']);
  });

  it('keeps notifications out of the chat and names the subagent of each delegation', () => {
    const parser = after(background.length);
    const delegations = parser
      .entries()
      .filter((entry) => entry.type === 'tool' && entry.verb === 'Delegated');

    expect(parser.entries().filter((entry) => entry.type === 'user')).toHaveLength(1);
    expect(delegations).toEqual([
      expect.objectContaining({ id: 'toolu-rev', subagent: 'a0123456789abcdef', outcome: 'ok' }),
      expect.objectContaining({ id: 'toolu-fg', subagent: 'afedcba9876543210', outcome: 'ok' }),
    ]);
  });

  const userLine = (uuid: string, content: unknown, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      type: 'user',
      uuid,
      timestamp: '2026-10-30T16:00:40.000Z',
      message: { role: 'user', content },
      ...extra,
    });
  const assistantCall = (id: string, name: string, input: unknown) =>
    JSON.stringify({
      type: 'assistant',
      uuid: `a-${id}`,
      timestamp: '2026-10-30T16:00:30.000Z',
      message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
    });
  const toolResult = (id: string, text: string, details?: unknown, isError = false) =>
    userLine(
      `r-${id}`,
      [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }],
      {
        ...(details === undefined ? {} : { toolUseResult: details }),
      },
    );
  const notice = (body: string) =>
    userLine('n-x', `<task-notification>\n${body}\n</task-notification>`, {
      origin: { kind: 'task-notification' },
    });
  const ids = (parser: ReturnType<typeof after>) => parser.background().map((item) => item.id);

  it('keeps a monitor running through its event notifications', () => {
    const parser = after(5);
    parser.push(
      notice(
        '<task-id>bmon1</task-id>\n<summary>Monitor event: "Watch"</summary>\n<event>ok</event>',
      ),
    );

    expect(ids(parser)).toContain('toolu-mon');
  });

  it('ends a task whose notification reports it failed', () => {
    const parser = after(3);
    parser.push(notice('<task-id>bci1</task-id>\n<status>failed</status>'));

    expect(ids(parser)).toEqual([]);
  });

  it('ends a subagent named only by its task id', () => {
    const parser = after(7);
    parser.push(notice('<task-id>a0123456789abcdef</task-id>\n<status>completed</status>'));

    expect(ids(parser)).toEqual(['toolu-ci', 'toolu-mon']);
  });

  it('counts a command Claude moved into the background without the flag', () => {
    const parser = createClaudeParser('/work/app');
    parser.push(
      assistantCall('toolu-long', 'Bash', { command: 'pnpm build', description: 'Build' }),
    );
    parser.push(
      toolResult('toolu-long', 'Command running in background', { backgroundTaskId: 'blong' }),
    );

    expect(parser.background()).toEqual([
      expect.objectContaining({ id: 'toolu-long', kind: 'shell', description: 'Build' }),
    ]);
  });

  it('counts no shell whose call failed', () => {
    const parser = createClaudeParser('/work/app');
    parser.push(assistantCall('toolu-bad', 'Bash', { command: 'x', run_in_background: true }));
    parser.push(toolResult('toolu-bad', 'Error', { backgroundTaskId: 'bbad' }, true));

    expect(parser.background()).toEqual([]);
  });

  it('ends a subagent whose launch failed, under its old name Task too', () => {
    const parser = createClaudeParser('/work/app');
    parser.push(assistantCall('toolu-task', 'Task', { description: 'Old name', prompt: 'p' }));

    expect(ids(parser)).toEqual(['toolu-task']);

    parser.push(toolResult('toolu-task', 'Agent type not found', undefined, true));

    expect(parser.background()).toEqual([]);
  });

  it('names no subagent whose id the app cannot address', () => {
    const parser = createClaudeParser('/work/app');
    parser.push(assistantCall('toolu-odd', 'Agent', { description: 'Odd', prompt: 'p' }));
    parser.push(toolResult('toolu-odd', 'Done', { status: 'completed', agentId: '../Evil ID' }));

    expect(parser.entries()).toEqual([expect.objectContaining({ id: 'toolu-odd', outcome: 'ok' })]);
    expect(parser.entries()[0]).not.toHaveProperty('subagent');
  });

  it('ends a shell stopped with KillShell', () => {
    const parser = after(3);
    parser.push(
      JSON.stringify({
        type: 'assistant',
        uuid: 'a-k',
        timestamp: '2026-10-30T16:00:20.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu-kill', name: 'KillShell', input: { shell_id: 'bci1' } },
          ],
        },
      }),
    );
    parser.push(
      JSON.stringify({
        type: 'user',
        uuid: 'r-k',
        timestamp: '2026-10-30T16:00:21.000Z',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu-kill', content: 'Killed', is_error: false },
          ],
        },
      }),
    );

    expect(parser.background()).toEqual([]);
  });

  it('keeps a monitor without an announced expiry open', () => {
    const parser = after(4);
    parser.push(
      JSON.stringify({
        type: 'user',
        uuid: 'r-m',
        timestamp: '2026-10-30T16:00:05.000Z',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu-mon',
              content: 'Monitor started (task bmon1)',
            },
          ],
        },
      }),
    );

    const monitor = parser.background().find((item) => item.kind === 'monitor');
    expect(monitor).toEqual(expect.objectContaining({ id: 'toolu-mon' }));
    expect(monitor?.expiresAt).toBeUndefined();
  });
});

describe('createClaudeParser for a subagent', () => {
  const subagent = lines('claude-subagent.jsonl');

  it('skips the lines of a subagent in the parent conversation', () => {
    const parser = createClaudeParser('/work/app');
    subagent.forEach((line) => parser.push(line));

    expect(parser.entries()).toEqual([]);
  });

  it("reads a subagent's own conversation, its prompt first", () => {
    const parser = createClaudeParser('/work/app', { sidechain: true });
    subagent.forEach((line) => parser.push(line));

    expect(parser.entries().map((entry) => entry.type)).toEqual(['user', 'tool', 'assistant']);
    expect(parser.entries()[0]).toEqual(expect.objectContaining({ text: 'Review it' }));
  });
});

describe('claudeSessionPath', () => {
  it('names the session file under the project folder of the working directory', () => {
    expect(claudeSessionPath('/home/me', '/Users/me/.herdr/worktrees/app', 'abc')).toBe(
      '/home/me/.claude/projects/-Users-me--herdr-worktrees-app/abc.jsonl',
    );
  });
});
