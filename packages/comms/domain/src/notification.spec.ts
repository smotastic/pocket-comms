import { describe, expect, it } from '@effect/vitest';
import type { Agent } from './agent.js';
import {
  excerptOf,
  MAX_EXCERPT_LENGTH,
  notificationOf,
  stillHolds,
  watchStep,
  type Change,
} from './notification.js';
import type { TranscriptEntry } from './transcript.js';

const agent = (overrides: Partial<Agent> & Pick<Agent, 'paneId'>): Agent => ({
  name: undefined,
  kind: 'claude',
  status: 'working',
  title: 'A task',
  workspaceId: 'w1',
  cwd: '/work/app',
  session: undefined,
  completion: undefined,
  ...overrides,
});

const none = new Set<string>();

/** The changes from `before` to `after`, after a first reading of `before`. */
const changesBetween = (
  before: ReadonlyArray<Agent>,
  after: ReadonlyArray<Agent>,
): ReadonlyArray<Change> => watchStep(watchStep(undefined, before).reading, after).changes;

describe('watchStep', () => {
  it('reports nothing for the first reading, even for agents that need the owner', () => {
    const step = watchStep(undefined, [
      agent({ paneId: 'p1', status: 'blocked' }),
      agent({ paneId: 'p2', status: 'done', completion: 3 }),
    ]);

    expect(step.changes).toEqual([]);
  });

  it('reports an agent that becomes blocked', () => {
    expect(
      changesBetween([agent({ paneId: 'p1' })], [agent({ paneId: 'p1', status: 'blocked' })]),
    ).toEqual([{ paneId: 'p1', attention: 'blocked' }]);
  });

  it('reports nothing for an agent that stays blocked', () => {
    expect(
      changesBetween(
        [agent({ paneId: 'p1', status: 'blocked' })],
        [agent({ paneId: 'p1', status: 'blocked' })],
      ),
    ).toEqual([]);
  });

  it('reports a new agent that appears blocked', () => {
    expect(changesBetween([], [agent({ paneId: 'p1', status: 'blocked' })])).toEqual([
      { paneId: 'p1', attention: 'blocked' },
    ]);
  });

  it('reports a blocked agent again after it was working in between', () => {
    const first = watchStep(undefined, [agent({ paneId: 'p1', status: 'blocked' })]);
    const working = watchStep(first.reading, [agent({ paneId: 'p1', status: 'working' })]);
    const again = watchStep(working.reading, [agent({ paneId: 'p1', status: 'blocked' })]);

    expect(working.changes).toEqual([]);
    expect(again.changes).toEqual([{ paneId: 'p1', attention: 'blocked' }]);
  });

  it('reports an agent that finishes a turn, with its completion', () => {
    expect(
      changesBetween(
        [agent({ paneId: 'p1', completion: 1 })],
        [agent({ paneId: 'p1', status: 'done', completion: 2 })],
      ),
    ).toEqual([{ paneId: 'p1', attention: 'done', completion: 2 }]);
  });

  it('reports a done agent with a new completion, also when it was done before', () => {
    expect(
      changesBetween(
        [agent({ paneId: 'p1', status: 'done', completion: 1 })],
        [agent({ paneId: 'p1', status: 'done', completion: 2 })],
      ),
    ).toEqual([{ paneId: 'p1', attention: 'done', completion: 2 }]);
  });

  it('reports nothing for an agent that stays done with the same completion, or turns idle', () => {
    expect(
      changesBetween(
        [
          agent({ paneId: 'p1', status: 'done', completion: 1 }),
          agent({ paneId: 'p2', status: 'done', completion: 4 }),
        ],
        [
          agent({ paneId: 'p1', status: 'done', completion: 1 }),
          agent({ paneId: 'p2', status: 'idle', completion: 4 }),
        ],
      ),
    ).toEqual([]);
  });

  it('reports nothing for an agent that turns from idle back to done with the same completion', () => {
    expect(
      changesBetween(
        [agent({ paneId: 'p1', status: 'idle', completion: 4 })],
        [agent({ paneId: 'p1', status: 'done', completion: 4 })],
      ),
    ).toEqual([]);
  });

  it('forgets an agent that left, so it counts as new when it comes back', () => {
    const first = watchStep(undefined, [agent({ paneId: 'p1', status: 'blocked' })]);
    const gone = watchStep(first.reading, []);
    const back = watchStep(gone.reading, [agent({ paneId: 'p1', status: 'blocked' })]);

    expect(back.changes).toEqual([{ paneId: 'p1', attention: 'blocked' }]);
  });
});

describe('stillHolds', () => {
  const blocked: Change = { paneId: 'p1', attention: 'blocked' };
  const done: Change = { paneId: 'p1', attention: 'done', completion: 2 };

  it('holds for an agent that is still blocked', () => {
    expect(stillHolds(blocked, [agent({ paneId: 'p1', status: 'blocked' })], none)).toBe(true);
  });

  it('does not hold for an agent that is gone or no longer blocked', () => {
    expect(stillHolds(blocked, [], none)).toBe(false);
    expect(stillHolds(blocked, [agent({ paneId: 'p1', status: 'working' })], none)).toBe(false);
  });

  it('holds for an agent still done with the same completion that the owner has not seen', () => {
    expect(stillHolds(done, [agent({ paneId: 'p1', status: 'done', completion: 2 })], none)).toBe(
      true,
    );
  });

  it('does not hold once the owner saw the completion, or the agent moved on', () => {
    const agents = [agent({ paneId: 'p1', status: 'done', completion: 2 })];
    expect(stillHolds(done, agents, new Set(['p1#2']))).toBe(false);
    expect(stillHolds(done, [agent({ paneId: 'p1', status: 'done', completion: 3 })], none)).toBe(
      false,
    );
    expect(stillHolds(done, [agent({ paneId: 'p1', status: 'idle', completion: 2 })], none)).toBe(
      false,
    );
  });
});

describe('excerptOf', () => {
  const entries: ReadonlyArray<TranscriptEntry> = [
    { type: 'assistant', id: 'a1', at: 1, text: 'First reply' },
    {
      type: 'tool',
      id: 't1',
      at: 2,
      verb: 'Used',
      questions: [{ header: 'Stack', text: 'Which stack?' }],
      outcome: 'pending',
    },
    { type: 'assistant', id: 'a2', at: 3, text: 'All  done,\n\nsee the **diff**.' },
  ];

  it('is the open question for a blocked agent', () => {
    expect(excerptOf('blocked', entries)).toBe('Which stack?');
  });

  it('is nothing for a blocked agent without an open question', () => {
    expect(excerptOf('blocked', entries.slice(0, 1))).toBeUndefined();
    expect(
      excerptOf('blocked', [
        {
          type: 'tool',
          id: 't1',
          at: 2,
          verb: 'Used',
          questions: [{ text: 'Which stack?', answer: 'Effect' }],
          outcome: 'ok',
        },
        { type: 'tool', id: 't2', at: 3, verb: 'Ran', target: 'pnpm test', outcome: 'pending' },
      ]),
    ).toBeUndefined();
  });

  it('is the last message, on one line, for a done agent', () => {
    expect(excerptOf('done', entries)).toBe('All done, see the **diff**.');
  });

  it('skips the tool calls after the last message of a done agent', () => {
    expect(
      excerptOf('done', [
        ...entries,
        { type: 'tool', id: 't2', at: 4, verb: 'Ran', target: 'git status', outcome: 'ok' },
      ]),
    ).toBe('All done, see the **diff**.');
  });

  it('is nothing for a done agent without a message', () => {
    expect(excerptOf('done', [])).toBeUndefined();
  });
});

describe('notificationOf', () => {
  it('names a blocked agent and opens its conversation', () => {
    expect(
      notificationOf({
        agent: agent({ paneId: 'w1:p1', name: 'kirk/one' }),
        attention: 'blocked',
        project: 'app',
        excerpt: 'Which stack?',
      }),
    ).toEqual({
      title: 'kirk/one needs you',
      body: 'app\nWhich stack?',
      tag: 'w1:p1',
      url: '/agents/kirk%2Fone?from=push',
    });
  });

  it('names a done agent by its pane id when it has no name', () => {
    expect(
      notificationOf({
        agent: agent({ paneId: 'w1:p1' }),
        attention: 'done',
        project: 'app',
        excerpt: undefined,
      }),
    ).toMatchObject({ title: 'w1:p1 is done', body: 'app' });
  });

  it('has an empty body without a project and an excerpt', () => {
    expect(
      notificationOf({
        agent: agent({ paneId: 'w1:p1' }),
        attention: 'done',
        project: undefined,
        excerpt: undefined,
      }).body,
    ).toBe('');
  });

  it('cuts a long excerpt short', () => {
    const { body } = notificationOf({
      agent: agent({ paneId: 'w1:p1' }),
      attention: 'blocked',
      project: undefined,
      excerpt: 'x'.repeat(500),
    });

    expect(body).toHaveLength(MAX_EXCERPT_LENGTH);
    expect(body.endsWith('…')).toBe(true);
  });

  const bodyOf = (excerpt: string) =>
    notificationOf({
      agent: agent({ paneId: 'w1:p1' }),
      attention: 'blocked',
      project: undefined,
      excerpt,
    }).body;

  it('keeps an excerpt of exactly the longest length whole', () => {
    expect(bodyOf('x'.repeat(MAX_EXCERPT_LENGTH))).toBe('x'.repeat(MAX_EXCERPT_LENGTH));
  });

  it('never cuts a character such as an emoji in half', () => {
    const body = bodyOf(`${'x'.repeat(MAX_EXCERPT_LENGTH - 2)}🎉🎉🎉`);

    expect(body).toBe(`${'x'.repeat(MAX_EXCERPT_LENGTH - 2)}🎉…`);
  });
});
