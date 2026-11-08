import { describe, expect, it } from '@effect/vitest';
import * as Schema from 'effect/Schema';
import { OpenApi } from 'effect/http-api';
import {
  Activity,
  AgentEvent,
  AGENTS_TO_START,
  BrainstormEvent,
  BrainstormMessageRequest,
  BrainstormState,
  SpeechText,
  CommsApi,
  IssueList,
  IssueNumberParam,
  KEYS,
  OverviewState,
  ProjectParam,
  ProposalDecisionRequest,
  ProposalParam,
  PushSubscription,
  PushUnsubscribeRequest,
  TranscriptEntry,
} from './index.js';

const document = () => OpenApi.fromApi(CommsApi);

type Operation = {
  responses?: Record<string, { content?: Record<string, unknown> }>;
};

const operationsOf = (paths: ReadonlyArray<[string, unknown]>) =>
  paths.flatMap(([, item]) => Object.values(item as Record<string, Operation>));

const operations = () => operationsOf(Object.entries(document().paths));

// The brainstorm chat (spec 013), the images (spec 014), the activity timeline (spec 017) and the
// push subscriptions (spec 018) live in the server and need no Herdr.
const herdrOperations = () =>
  operationsOf(
    Object.entries(document().paths).filter(
      ([path]) =>
        !['/api/v1/brainstorm', '/api/v1/images', '/api/v1/activity', '/api/v1/push'].some(
          (prefix) => path.startsWith(prefix),
        ),
    ),
  );

describe('CommsApi', () => {
  it('serves the agents, the tasks, the issues, the brainstorm chat, the images, the activity and speech under /api/v1', () => {
    expect(Object.keys(document().paths).sort()).toEqual([
      '/api/v1/activity',
      '/api/v1/activity/events',
      '/api/v1/agents',
      '/api/v1/agents/{agent}',
      '/api/v1/agents/{agent}/close',
      '/api/v1/agents/{agent}/events',
      '/api/v1/agents/{agent}/keys',
      '/api/v1/agents/{agent}/prompt',
      '/api/v1/agents/{agent}/screen',
      '/api/v1/agents/{agent}/seen',
      '/api/v1/agents/{agent}/subagents/{subagent}',
      '/api/v1/agents/{agent}/subagents/{subagent}/events',
      '/api/v1/agents/{agent}/text',
      '/api/v1/agents/{agent}/transcript',
      '/api/v1/brainstorm',
      '/api/v1/brainstorm/events',
      '/api/v1/brainstorm/messages',
      '/api/v1/brainstorm/proposals/{proposal}/decision',
      '/api/v1/brainstorm/reset',
      '/api/v1/events',
      '/api/v1/images',
      '/api/v1/images/{image}',
      '/api/v1/projects',
      '/api/v1/projects/{project}/issues',
      '/api/v1/projects/{project}/issues/{number}/close',
      '/api/v1/projects/{project}/issues/{number}/implement',
      '/api/v1/push/key',
      '/api/v1/push/subscriptions',
      '/api/v1/push/subscriptions/remove',
      '/api/v1/quick-replies',
      '/api/v1/speech/transcriptions',
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
    for (const path of [
      '/api/v1/events',
      '/api/v1/agents/{agent}/events',
      '/api/v1/brainstorm/events',
      '/api/v1/activity/events',
    ]) {
      const ok = document().paths[path]?.get?.responses?.['200'] as Operation['responses'];
      expect(Object.keys(ok?.['content'] ?? {})).toEqual(['text/event-stream']);
    }
  });

  it('tells the kinds of activity apart and leaves out the names an agent has not', () => {
    const decode = Schema.decodeUnknownSync(Activity);
    const agent = { ref: 'w1:p1', paneId: 'w1:p1', workspace: 'notes' };
    const common = { id: 'e1', at: 1, agent, live: false };

    expect(
      decode({
        events: [
          { type: 'keys', ...common, keys: ['enter'] },
          { type: 'prompt', ...common, excerpt: 'Fix it', images: 0 },
          { type: 'status', ...common, status: 'done' },
          { type: 'gone', ...common },
          { type: 'typed', ...common, excerpt: 'Use SQLite' },
        ],
      }).events.map((event) => event.type),
    ).toEqual(['keys', 'prompt', 'status', 'gone', 'typed']);
    expect(() => decode({ events: [{ type: 'status', ...common, status: 'idle' }] })).toThrow();
    expect(() => decode({ events: [{ type: 'keys', ...common, keys: ['x'] }] })).toThrow();
  });

  it('documents the 403 of the Tailscale identity check on every operation', () => {
    for (const operation of operations()) {
      expect(Object.keys(operation.responses ?? {})).toContain('403');
    }
  });

  it('documents a 503 for every operation that needs Herdr', () => {
    for (const operation of herdrOperations()) {
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
    expect(KEYS).toEqual([
      '1',
      '2',
      '3',
      'up',
      'down',
      'left',
      'right',
      'enter',
      'esc',
      'ctrl+c',
      'pageup',
      'pagedown',
    ]);
  });
});

describe('push wire schemas', () => {
  // Strict like the API's payloads, so an undeclared field fails here too.
  const decode = Schema.decodeUnknownSync(PushSubscription, { onExcessProperty: 'error' });
  const subscription = {
    endpoint: 'https://web.push.apple.com/QGuQyavXutnMH',
    keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' },
  };

  it("takes a browser push subscription as the browser's toJSON gives it", () => {
    expect(decode(subscription)).toEqual(subscription);
    expect(decode({ ...subscription, expirationTime: null })).toEqual({
      ...subscription,
      expirationTime: null,
    });
    expect(decode({ ...subscription, expirationTime: 1793391381245 })).toMatchObject(subscription);
  });

  it('takes only an https endpoint of at most 2000 characters', () => {
    for (const endpoint of [
      'http://web.push.apple.com/x',
      'HTTPS://web.push.apple.com/x',
      'https://',
      'https://web.push.apple.com/a b',
      `https://web.push.apple.com/${'x'.repeat(2000)}`,
    ]) {
      expect(() => decode({ ...subscription, endpoint }), endpoint).toThrow(/endpoint/u);
    }
  });

  it('takes only keys that are not empty and at most 200 characters', () => {
    expect(() => decode({ ...subscription, keys: { ...subscription.keys, auth: '' } })).toThrow(
      /auth/u,
    );
    expect(() =>
      decode({ ...subscription, keys: { ...subscription.keys, p256dh: 'x'.repeat(201) } }),
    ).toThrow(/p256dh/u);
    expect(() => decode({ endpoint: subscription.endpoint })).toThrow(/keys/u);
  });

  it('unsubscribes by an https endpoint alone', () => {
    const unsubscribe = Schema.decodeUnknownSync(PushUnsubscribeRequest, {
      onExcessProperty: 'error',
    });

    expect(unsubscribe({ endpoint: subscription.endpoint })).toEqual({
      endpoint: subscription.endpoint,
    });
    expect(() => unsubscribe({ endpoint: 'http://web.push.apple.com/x' })).toThrow(/endpoint/u);
  });

  it('answers 503 when the server cannot keep or read the devices', () => {
    for (const [path, method] of [
      ['/api/v1/push/key', 'get'],
      ['/api/v1/push/subscriptions', 'post'],
      ['/api/v1/push/subscriptions/remove', 'post'],
    ] as const) {
      const item = document().paths[path] as Record<string, Operation> | undefined;
      expect(Object.keys(item?.[method]?.responses ?? {}), path).toContain('503');
    }
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

const PICTURE = 'k5w3x7q2m4n6p3r2s4t6v5x2z4';

describe('brainstorm wire schemas', () => {
  it('round-trips an event of every kind, the chat’s own entries among the shared ones', () => {
    const issue = {
      type: 'proposal',
      kind: 'issue',
      id: 'p1',
      at: 3,
      project: 'pocket-home',
      title: 'Dark mode',
      body: 'A toggle.',
      pictures: [PICTURE],
      attached: [{ image: PICTURE, url: 'http://gitea/attachments/u-1' }],
      state: { _tag: 'created', number: 12, url: 'http://gitea/i/12' },
    };
    const edit = {
      type: 'proposal',
      kind: 'edit',
      id: 'e1',
      at: 4,
      project: 'pocket-comms',
      number: 11,
      url: 'http://gitea/i/11',
      title: 'Orchestrator',
      body: 'New.',
      base: { title: 'Orchestrator', body: 'Old.' },
      pictures: [],
      attached: [],
      state: { _tag: 'updated', url: 'http://gitea/i/11' },
    };
    const entries = [
      { kind: 'said', id: 'u1', at: 1, text: 'Idea', images: [PICTURE] },
      { kind: 'agentMessage', text: '**Nice**' },
      { kind: 'toolStarted', callId: 'c1', tool: 'read_issue', target: 'pocket-comms #11' },
      { kind: 'toolFinished', callId: 'c1', isError: false },
      { kind: 'proposal', proposal: issue },
      {
        kind: 'proposal',
        proposal: { ...issue, state: { _tag: 'attaching', number: 13, url: 'http://gitea/i/13' } },
      },
      { kind: 'proposal', proposal: edit },
      { kind: 'turnFailed', reason: 'The model cannot be reached.' },
      { kind: 'turnEnded' },
      { kind: 'turnStopped' },
      { kind: 'chatStarted' },
    ];
    const events = [
      ...entries.map((entry, index) => ({ kind: 'entry', sequence: index + 1, entry })),
      { kind: 'delta', text: 'Nice' },
      { kind: 'draft', text: 'Nice. Which' },
    ];
    const codec = Schema.Array(BrainstormEvent);
    expect(Schema.encodeSync(codec)(Schema.decodeUnknownSync(codec)(events))).toEqual(events);
  });

  it('takes a message of text, of pictures, or both', () => {
    const decode = Schema.decodeUnknownSync(BrainstormMessageRequest);
    expect(decode({ text: 'Idea' })).toEqual({ text: 'Idea' });
    expect(decode({ text: '', imageIds: [PICTURE] })).toEqual({ text: '', imageIds: [PICTURE] });
    expect(() => decode({ text: 'x', imageIds: Array(6).fill(PICTURE) })).toThrow();
  });

  it('shows the chat pictures, whether the model sees them and whether voice works', () => {
    const state = {
      _tag: 'Ready',
      answering: false,
      seesPictures: false,
      pictures: [{ id: PICTURE, number: 1, available: true }],
      voice: true,
    };
    expect(Schema.decodeUnknownSync(BrainstormState)(state)).toEqual(state);
    const { voice: _, ...withoutVoice } = state;
    expect(() => Schema.decodeUnknownSync(BrainstormState)(withoutVoice)).toThrow();
  });

  it('answers the words of a voice message', () => {
    expect(Schema.decodeUnknownSync(SpeechText)({ text: 'Hallo' })).toEqual({ text: 'Hallo' });
  });

  it('reads only proposal ids without a slash or a dot from the path', () => {
    const proposal = Schema.is(ProposalParam);
    expect(['2f1c9a7e-4b7d', 'p1'].map(proposal)).toEqual([true, true]);
    expect(['..', 'a/b', ''].map(proposal)).toEqual([false, false, false]);
  });

  it('takes a decision to create with a draft, to apply an edit, or to discard', () => {
    const decode = Schema.decodeUnknownSync(ProposalDecisionRequest);
    expect(decode({ _tag: 'Discard' })).toEqual({ _tag: 'Discard' });
    expect(decode({ _tag: 'Apply', title: 'T', body: 'B' })).toEqual({
      _tag: 'Apply',
      title: 'T',
      body: 'B',
    });
    expect(decode({ _tag: 'FinishWithout' })).toEqual({ _tag: 'FinishWithout' });
    expect(decode({ _tag: 'Apply', title: 'T', body: 'B', pictures: [PICTURE] })).toMatchObject({
      pictures: [PICTURE],
    });
    expect(
      decode({ _tag: 'Create', draft: { project: 'a', title: 'T', body: '' }, pictures: [] }),
    ).toMatchObject({ pictures: [] });
    expect(() =>
      decode({ _tag: 'Apply', title: 'T', body: 'B', pictures: Array(6).fill(PICTURE) }),
    ).toThrow();
    expect(() => decode({ _tag: 'Apply', title: 'T', body: 'B', pictures: ['../x'] })).toThrow();
    expect(() => decode({ _tag: 'Create' })).toThrow();
    expect(() => decode({ _tag: 'Apply', title: 'x'.repeat(256), body: '' })).toThrow();
    expect(() =>
      decode({ _tag: 'Create', draft: { project: 'a', title: 'x'.repeat(256), body: '' } }),
    ).toThrow();
  });
});
