import { describe, expect, it } from '@effect/vitest';
import * as Schema from 'effect/Schema';
import { OpenApi } from 'effect/http-api';
import {
  AgentEvent,
  AGENTS_TO_START,
  CommsApi,
  IssueList,
  IssueNumberParam,
  KEYS,
  OverviewState,
  ProjectParam,
  TranscriptEntry,
} from './index.js';

const document = () => OpenApi.fromApi(CommsApi);

type Operation = {
  responses?: Record<string, { content?: Record<string, unknown> }>;
};

const operations = () =>
  Object.values(document().paths).flatMap((item) =>
    Object.values(item as Record<string, Operation>),
  );

describe('CommsApi', () => {
  it('serves the agents, the tasks and the issues under /api/v1', () => {
    expect(Object.keys(document().paths).sort()).toEqual([
      '/api/v1/agents',
      '/api/v1/agents/{agent}',
      '/api/v1/agents/{agent}/close',
      '/api/v1/agents/{agent}/events',
      '/api/v1/agents/{agent}/keys',
      '/api/v1/agents/{agent}/prompt',
      '/api/v1/agents/{agent}/screen',
      '/api/v1/agents/{agent}/seen',
      '/api/v1/agents/{agent}/transcript',
      '/api/v1/events',
      '/api/v1/projects',
      '/api/v1/projects/{project}/issues',
      '/api/v1/projects/{project}/issues/{number}/close',
      '/api/v1/projects/{project}/issues/{number}/implement',
      '/api/v1/tasks',
    ]);
  });

  it('reads only issue numbers and project names without a slash from the path', () => {
    const number = Schema.is(IssueNumberParam);
    const project = Schema.is(ProjectParam);

    expect(['8', '1234'].map(number)).toEqual([true, true]);
    expect(['0', '08', '-1', '1.5', 'x'].map(number)).toEqual([false, false, false, false, false]);
    expect(['pocket-comms', '..', 'a/b', ''].map(project)).toEqual([true, true, false, false]);
  });

  it('tells the three states of an issue list apart', () => {
    const decode = Schema.decodeUnknownSync(IssueList);

    expect(decode({ _tag: 'NotConfigured' })).toEqual({ _tag: 'NotConfigured' });
    expect(decode({ _tag: 'NoGiteaRemote' })).toEqual({ _tag: 'NoGiteaRemote' });
    expect(() => decode({ _tag: 'Listed' })).toThrow();
  });

  it('streams the live updates as server-sent events', () => {
    for (const path of ['/api/v1/events', '/api/v1/agents/{agent}/events']) {
      const ok = document().paths[path]?.get?.responses?.['200'] as Operation['responses'];
      expect(Object.keys(ok?.['content'] ?? {})).toEqual(['text/event-stream']);
    }
  });

  it('documents the 403 of the Tailscale identity check on every operation', () => {
    for (const operation of operations()) {
      expect(Object.keys(operation.responses ?? {})).toContain('403');
    }
  });

  it('documents a 503 for every operation that needs Herdr', () => {
    for (const operation of operations()) {
      expect(Object.keys(operation.responses ?? {})).toContain('503');
    }
  });

  it('answers a created task with 201', () => {
    expect(Object.keys(document().paths['/api/v1/tasks']?.post?.responses ?? {})).toContain('201');
  });

  it('starts only Claude and Pi agents', () => {
    expect(AGENTS_TO_START).toEqual(['claude', 'pi']);
  });

  it('accepts only the keys of the approval panel', () => {
    expect(KEYS).toEqual(['1', '2', '3', 'up', 'down', 'enter', 'esc', 'ctrl+c']);
  });
});

describe('wire schemas', () => {
  it('round-trips a transcript entry of every kind', () => {
    const entries = [
      { type: 'user', id: 'u1', at: 1, text: 'Hi' },
      { type: 'assistant', id: 'a1', at: 2, text: '**Hello**' },
      {
        type: 'tool',
        id: 't1',
        at: 3,
        verb: 'Edited',
        target: 'src/a.ts',
        added: 2,
        removed: 1,
        outcome: 'ok',
      },
      {
        type: 'tool',
        id: 'q1',
        at: 4,
        verb: 'Used',
        target: 'AskUserQuestion',
        questions: [
          { header: 'Stack', text: 'Keep Effect?', answer: 'Keep Effect' },
          { text: 'Keep Nx?' },
        ],
        outcome: 'ok',
      },
    ];
    const codec = Schema.Array(TranscriptEntry);
    expect(Schema.encodeSync(codec)(Schema.decodeUnknownSync(codec)(entries))).toEqual(entries);
  });

  it('decodes both overview states', () => {
    expect(
      Schema.decodeUnknownSync(OverviewState)({
        _tag: 'Unavailable',
        reason: 'Herdr is not running.',
      }),
    ).toEqual({ _tag: 'Unavailable', reason: 'Herdr is not running.' });
    expect(
      Schema.decodeUnknownSync(OverviewState)({
        _tag: 'Available',
        overview: { needsYou: [], groups: [] },
      }),
    ).toMatchObject({ _tag: 'Available' });
  });

  it('decodes an entries event with its reset flag', () => {
    expect(
      Schema.decodeUnknownSync(AgentEvent)({
        type: 'entries',
        reset: true,
        entries: [],
        activity: 'Thinking…',
      }),
    ).toMatchObject({ type: 'entries', reset: true });
  });
});
