import { afterEach, describe, expect, it, vi } from '@effect/vitest';
import {
  ActivityInbound,
  AgentNotFoundError,
  AgentsInbound,
  BrainstormBusyError,
  BrainstormInbound,
  BrainstormNotSetUpError,
  BranchExistsError,
  GiteaNotConfiguredError,
  GiteaUnavailableError,
  HerdrRejectedError,
  HerdrUnavailableError,
  ImageNotFoundError,
  ImageNotSavedError,
  ImagesInbound,
  IssueClosedError,
  IssueNotFoundError,
  IssuesInbound,
  NoGiteaRemoteError,
  NotAWorktreeError,
  ProjectGitError,
  ProjectNotFoundError,
  SubagentNotFoundError,
  ProposalDecidedError,
  ProposalNotFoundError,
  TasksInbound,
  WorktreeHasChangesError,
  type CloseIssueInput,
  type ImplementIssueInput,
  type IssueListDto,
  type ActivityDto,
  type AgentDto,
  type CreateTaskInput,
  type OverviewDto,
} from '@pocket-comms/comms-application';
import { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import { HttpRouter, HttpServer } from 'effect/http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commsServerLayer } from './comms-api.layer.js';

const kirk: AgentDto = {
  ref: 'kirk',
  paneId: 'w1:p1',
  name: 'kirk',
  kind: 'claude',
  format: 'claude',
  status: 'blocked',
  title: 'Fix the build',
  cwd: '/work/app',
  workspace: 'feature',
  project: 'app',
  worktree: 'feature',
  changedAt: 1_000,
  needsYou: true,
  background: [
    {
      id: 'toolu-ci',
      kind: 'shell',
      description: 'Wait for CI',
      startedAt: 900,
      inBackground: true,
    },
  ],
};
const overview: OverviewDto = { needsYou: [kirk], groups: [] };

const webDist = () => {
  const dir = mkdtempSync(join(tmpdir(), 'comms-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>pocket-comms</title>');
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(join(dir, 'manifest.webmanifest'), '{"name":"pocket-comms"}');
  return dir;
};

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

/** The whole server on a mock of the use cases; `call` sends the allowed login unless told not to. */
const serve = (
  inbound: Partial<AgentsInbound['Service']>,
  web?: string,
  tasks: Partial<TasksInbound['Service']> = {},
  issues: Partial<IssuesInbound['Service']> = {},
  brainstorm: Partial<BrainstormInbound['Service']> = {},
  images: Partial<ImagesInbound['Service']> = {},
  activity: Partial<ActivityInbound['Service']> = {},
) => {
  const app = HttpRouter.toWebHandler(
    commsServerLayer({
      allowedLogin: 'smotastic@',
      readiness: Effect.void,
      ...(web === undefined ? {} : { webDist: web }),
    }).pipe(
      Layer.provide(Layer.mock(AgentsInbound, inbound)),
      Layer.provide(Layer.mock(TasksInbound, tasks)),
      Layer.provide(Layer.mock(IssuesInbound, issues)),
      Layer.provide(Layer.mock(BrainstormInbound, brainstorm)),
      Layer.provide(Layer.mock(ImagesInbound, { sweep: Effect.void, ...images })),
      Layer.provide(Layer.mock(ActivityInbound, activity)),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  );
  dispose = app.dispose;
  return (path: string, init: RequestInit & { readonly login?: string | null } = {}) => {
    const headers = new Headers(init.headers);
    if (init.login !== null) headers.set('tailscale-user-login', init.login ?? 'smotastic@github');
    return app.handler(new Request(`http://localhost${path}`, { ...init, headers }));
  };
};

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('the Tailscale identity check', () => {
  it('rejects a request without a login with a 403 problem', async () => {
    const call = serve({ overview: Effect.succeed(overview) });

    const response = await call('/api/v1/agents', { login: null });

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({
      status: 403,
      type: 'urn:pocket-comms:problem:login-not-allowed',
    });
  });

  it('rejects another login', async () => {
    const call = serve({ overview: Effect.succeed(overview) });

    expect((await call('/api/v1/agents', { login: 'someone@github' })).status).toBe(403);
  });

  it.each(['/health/live', '/health/ready', '/docs/openapi.json', '/', '/no/such/route'])(
    'guards %s too',
    async (path) => {
      const call = serve({}, webDist());

      expect((await call(path, { login: null })).status).toBe(403);
    },
  );

  it('lets the allowed login in', async () => {
    const call = serve({ overview: Effect.succeed(overview) });

    const response = await call('/api/v1/agents');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(overview);
  });
});

describe('the agents API', () => {
  it('answers 503 while Herdr is away', async () => {
    const call = serve({
      overview: Effect.fail(new HerdrUnavailableError({ reason: 'connect ENOENT' })),
    });

    const response = await call('/api/v1/agents');

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      type: 'urn:pocket-comms:problem:herdr-unavailable',
      detail: 'connect ENOENT',
    });
  });

  it('answers 404 for an unknown agent', async () => {
    const call = serve({ agent: (ref) => Effect.fail(new AgentNotFoundError({ ref })) });

    const response = await call('/api/v1/agents/nobody');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      type: 'urn:pocket-comms:problem:agent-not-found',
    });
  });

  it('addresses an agent by its pane id', async () => {
    const asked: Array<string> = [];
    const call = serve({
      agent: (ref) => {
        asked.push(ref);
        return Effect.succeed(kirk);
      },
    });

    expect((await call('/api/v1/agents/w1:p1')).status).toBe(200);
    expect(asked).toEqual(['w1:p1']);
  });

  it('returns the screen', async () => {
    const call = serve({ screen: () => Effect.succeed('\u001b[1mAllow?\u001b[0m') });

    expect(await (await call('/api/v1/agents/kirk/screen')).json()).toEqual({
      text: '\u001b[1mAllow?\u001b[0m',
    });
  });

  it('sends a prompt and answers 204', async () => {
    const sent: Array<[string, string]> = [];
    const call = serve({
      prompt: (ref, text) => Effect.sync(() => void sent.push([ref, text])),
    });

    const response = await call('/api/v1/agents/kirk/prompt', json({ text: 'Run the tests' }));

    expect(response.status).toBe(204);
    expect(sent).toEqual([['kirk', 'Run the tests']]);
  });

  it('answers 422 for a blank prompt', async () => {
    const call = serve({
      prompt: () =>
        Effect.fail(
          new InvalidInputError({ issues: [{ field: 'text', message: 'Write a message first.' }] }),
        ),
    });

    const response = await call('/api/v1/agents/kirk/prompt', json({ text: ' ' }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      errors: [{ field: 'text', message: 'Write a message first.' }],
    });
  });

  it('answers 422 for a key the app does not offer', async () => {
    const call = serve({ sendKeys: () => Effect.void });

    const response = await call('/api/v1/agents/kirk/keys', json({ keys: ['ctrl+d'] }));

    expect(response.status).toBe(422);
  });

  it('answers 409 when Herdr refuses the keys', async () => {
    const call = serve({
      sendKeys: (ref) =>
        Effect.fail(new HerdrRejectedError({ ref, code: 'agent_not_ready', message: 'Not ready' })),
    });

    const response = await call('/api/v1/agents/kirk/keys', json({ keys: ['1'] }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      type: 'urn:pocket-comms:problem:agent-refused-input',
    });
  });

  it('marks an agent as seen', async () => {
    const seen: Array<string> = [];
    const call = serve({ markSeen: (ref) => Effect.sync(() => void seen.push(ref)) });

    expect((await call('/api/v1/agents/kirk/seen', { method: 'POST' })).status).toBe(204);
    expect(seen).toEqual(['kirk']);
  });

  it('closes an agent, without force unless asked', async () => {
    const closed: Array<[string, boolean]> = [];
    const call = serve({
      close: (ref, force) => Effect.sync(() => void closed.push([ref, force])),
    });

    expect((await call('/api/v1/agents/kirk/close', json({}))).status).toBe(204);
    expect((await call('/api/v1/agents/kirk/close', json({ force: true }))).status).toBe(204);
    expect(closed).toEqual([
      ['kirk', false],
      ['kirk', true],
    ]);
  });

  it.each([
    [new AgentNotFoundError({ ref: 'kirk' }), 404, 'agent-not-found'],
    [new NotAWorktreeError({ ref: 'kirk' }), 409, 'not-a-worktree'],
    [new WorktreeHasChangesError({ ref: 'kirk' }), 409, 'worktree-has-changes'],
    [new ProjectGitError({ project: 'app', reason: 'status failed' }), 409, 'project-git-failed'],
    [new HerdrRejectedError({ ref: 'w2', code: 'c', message: 'm' }), 409, 'worktree-not-removed'],
    [new HerdrUnavailableError({ reason: 'away' }), 503, 'herdr-unavailable'],
  ] as const)('maps a close failing with %s to %i', async (error, status, slug) => {
    const call = serve({ close: () => Effect.fail(error) });

    const response = await call('/api/v1/agents/kirk/close', json({}));

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ type: `urn:pocket-comms:problem:${slug}` });
  });

  it('reads a subagent of an agent', async () => {
    const subagent = {
      id: 'a1',
      description: 'Review the diff',
      agentType: 'general-purpose',
      running: true,
      inBackground: true,
      entries: [],
      activity: 'Thinking…',
    };
    const call = serve({
      subagent: (ref, id) =>
        ref === 'kirk' && id === 'a1'
          ? Effect.succeed(subagent)
          : Effect.fail(new SubagentNotFoundError({ ref, subagent: id })),
    });

    const found = await call('/api/v1/agents/kirk/subagents/a1');
    const missing = await call('/api/v1/agents/kirk/subagents/b2');
    const refused = await call('/api/v1/agents/kirk/subagents/a1', { login: null });

    expect(found.status).toBe(200);
    expect(await found.json()).toEqual(subagent);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { type: string }).type).toContain('subagent-not-found');
    expect(refused.status).toBe(403);
  });

  it("streams a subagent's conversation as server-sent events", async () => {
    const event = {
      type: 'entries',
      reset: true,
      entries: [],
      activity: 'Thinking…',
    } as const;
    const call = serve({ subagentEvents: () => Effect.succeed(Stream.make(event)) });

    const response = await call('/api/v1/agents/kirk/subagents/a1/events');

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const text = await response.text();
    expect(JSON.parse(text.slice(text.indexOf('data: ') + 6).split('\n')[0] ?? '')).toEqual(event);
  });

  it('streams the overview as server-sent events', async () => {
    const call = serve({
      overviewChanges: Stream.make({ _tag: 'Available', overview } as const),
    });

    const response = await call('/api/v1/events');

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const text = await response.text();
    expect(text).toContain('data: ');
    expect(JSON.parse(text.slice(text.indexOf('data: ') + 6).split('\n')[0] ?? '')).toEqual({
      _tag: 'Available',
      overview,
    });
  });
});

describe('the tasks API', () => {
  const task = {
    project: 'pocket-comms',
    task: 'Add a dark mode toggle',
    branch: 'feat/dark-mode-toggle',
  };
  const created = {
    workspace: 'wK',
    branch: 'feat/dark-mode-toggle',
    path: '/worktrees/feat-dark-mode-toggle',
    agent: undefined,
  };

  it('lists the projects', async () => {
    const call = serve({}, undefined, {
      projects: Effect.succeed([{ name: 'pocket-comms', open: true }]),
    });

    const response = await call('/api/v1/projects');

    expect(await response.json()).toEqual({ projects: [{ name: 'pocket-comms', open: true }] });
  });

  it('answers 503 for the projects while Herdr is away', async () => {
    const call = serve({}, undefined, {
      projects: Effect.fail(new HerdrUnavailableError({ reason: 'connect ENOENT' })),
    });

    expect((await call('/api/v1/projects')).status).toBe(503);
  });

  it('creates a task with an agent and answers 201', async () => {
    const asked: Array<CreateTaskInput> = [];
    const call = serve({}, undefined, {
      create: (input) =>
        Effect.sync(() => {
          asked.push(input);
          return {
            ...created,
            agent: { ref: 'feat-dark-mode-toggle', started: true, prompted: true, note: undefined },
          };
        }),
    });

    const response = await call('/api/v1/tasks', json({ ...task, agent: { kind: 'claude' } }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      ...created,
      agent: { ref: 'feat-dark-mode-toggle', started: true, prompted: true },
    });
    expect(asked).toEqual([{ ...task, agent: 'claude' }]);
  });

  it('creates a task without an agent', async () => {
    const asked: Array<CreateTaskInput> = [];
    const call = serve({}, undefined, {
      create: (input) => Effect.sync(() => (asked.push(input), created)),
    });

    expect((await call('/api/v1/tasks', json(task))).status).toBe(201);
    expect(asked).toEqual([{ ...task, agent: undefined }]);
  });

  it.each([
    { ...task, agent: { kind: 'codex' } },
    { ...task, branch: '' },
    { ...task, extra: true },
  ])('answers 422 for the request %j', async (body) => {
    const call = serve({}, undefined, { create: () => Effect.succeed(created) });

    expect((await call('/api/v1/tasks', json(body))).status).toBe(422);
  });

  it.each([
    [
      new InvalidInputError({ issues: [{ field: 'project', message: 'Unknown.' }] }),
      422,
      'invalid-request',
    ],
    [new BranchExistsError({ branch: 'feat/x' }), 409, 'branch-exists'],
    [new ProjectGitError({ project: 'p', reason: 'fetch failed' }), 409, 'project-git-failed'],
    [new HerdrRejectedError({ ref: 'feat/x', code: 'c', message: 'm' }), 409, 'worktree-refused'],
    [new HerdrUnavailableError({ reason: 'away' }), 503, 'herdr-unavailable'],
  ] as const)('maps %s to %i', async (error, status, slug) => {
    const call = serve({}, undefined, { create: () => Effect.fail(error) });

    const response = await call('/api/v1/tasks', json(task));

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ type: `urn:pocket-comms:problem:${slug}` });
  });

  it('rejects a request without the allowed login', async () => {
    const call = serve({}, undefined, { create: () => Effect.succeed(created) });

    expect((await call('/api/v1/tasks', { ...json(task), login: null })).status).toBe(403);
  });
});

describe('the issues API', () => {
  const listed: IssueListDto = {
    _tag: 'Listed',
    repository: {
      owner: 'smotastic',
      name: 'pocket-comms',
      url: 'http://gitea.test/smotastic/pocket-comms',
    },
    issues: [
      {
        number: 8,
        title: 'feat: issue list',
        labels: ['enhancement'],
        updatedAt: 1_000,
        url: 'http://gitea.test/smotastic/pocket-comms/issues/8',
        branch: 'feat/8-issue-list',
        work: [
          {
            branch: 'feat/8-issue-list',
            agents: [{ ref: 'feat-8-issue-list', status: 'working' }],
          },
        ],
        inProgress: true,
      },
    ],
  };
  const created = {
    workspace: 'wK',
    branch: 'feat/8-issue-list',
    path: '/worktrees/feat-8-issue-list',
    agent: { ref: 'feat-8-issue-list', started: true, prompted: true, note: undefined },
    markNote: undefined,
  };
  const issues = (inbound: Partial<IssuesInbound['Service']>) => serve({}, undefined, {}, inbound);

  it.each([listed, { _tag: 'NoGiteaRemote' }, { _tag: 'NotConfigured' }] as const)(
    'lists the issues of a project as %j',
    async (list) => {
      const asked: Array<string> = [];
      const call = issues({ issues: (project) => Effect.sync(() => (asked.push(project), list)) });

      const response = await call('/api/v1/projects/pocket-comms/issues');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(list);
      expect(asked).toEqual(['pocket-comms']);
    },
  );

  it.each([
    [new ProjectNotFoundError({ project: 'nope' }), 404, 'project-not-found'],
    [
      new GiteaUnavailableError({ reason: 'Gitea refused the token (401).' }),
      503,
      'gitea-unavailable',
    ],
  ] as const)('maps the list failure %s to %i', async (error, status, slug) => {
    const call = issues({ issues: () => Effect.fail(error) });

    const response = await call('/api/v1/projects/nope/issues');

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ type: `urn:pocket-comms:problem:${slug}` });
  });

  it('implements an issue and answers 201', async () => {
    const asked: Array<ImplementIssueInput> = [];
    const call = issues({
      implement: (input) => Effect.sync(() => (asked.push(input), created)),
    });

    const response = await call(
      '/api/v1/projects/pocket-comms/issues/8/implement',
      json({ branch: 'feat/8-issue-list' }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      workspace: created.workspace,
      branch: created.branch,
      path: created.path,
      agent: { prompted: true },
    });
    expect(asked).toEqual([{ project: 'pocket-comms', number: 8, branch: 'feat/8-issue-list' }]);
  });

  it('says why a started issue was not marked in progress', async () => {
    const markNote = '#8 was not marked in progress: Gitea refused the token (403).';
    const call = issues({ implement: () => Effect.succeed({ ...created, markNote }) });

    const response = await call(
      '/api/v1/projects/pocket-comms/issues/8/implement',
      json({ branch: 'feat/8-issue-list' }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ branch: 'feat/8-issue-list', markNote });
  });

  it.each([
    ['/api/v1/projects/pocket-comms/issues/0/implement', { branch: 'feat/x' }],
    ['/api/v1/projects/pocket-comms/issues/x/implement', { branch: 'feat/x' }],
    ['/api/v1/projects/pocket-comms/issues/8/implement', { branch: '' }],
    ['/api/v1/projects/pocket-comms/issues/8/implement', { branch: 'feat/x', agent: 'pi' }],
  ])('answers 422 for %s with %j', async (path, body) => {
    const call = issues({ implement: () => Effect.succeed(created) });

    expect((await call(path, json(body))).status).toBe(422);
  });

  it.each([
    [new ProjectNotFoundError({ project: 'p' }), 404, 'project-not-found'],
    [new IssueNotFoundError({ number: 8 }), 404, 'issue-not-found'],
    [new IssueClosedError({ number: 8 }), 409, 'issue-closed'],
    [new NoGiteaRemoteError({ project: 'p' }), 409, 'no-gitea-remote'],
    [new GiteaNotConfiguredError(), 409, 'gitea-not-configured'],
    [new GiteaUnavailableError({ reason: 'away' }), 503, 'gitea-unavailable'],
    [new BranchExistsError({ branch: 'feat/8-x' }), 409, 'branch-exists'],
    [
      new InvalidInputError({ issues: [{ field: 'branch', message: 'Bad.' }] }),
      422,
      'invalid-request',
    ],
    [new ProjectGitError({ project: 'p', reason: 'fetch failed' }), 409, 'project-git-failed'],
    [new HerdrRejectedError({ ref: 'feat/x', code: 'c', message: 'm' }), 409, 'worktree-refused'],
    [new HerdrUnavailableError({ reason: 'away' }), 503, 'herdr-unavailable'],
  ] as const)('maps the implement failure %s to %i', async (error, status, slug) => {
    const call = issues({ implement: () => Effect.fail(error) });

    const response = await call(
      '/api/v1/projects/pocket-comms/issues/8/implement',
      json({ branch: 'feat/8-x' }),
    );

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ type: `urn:pocket-comms:problem:${slug}` });
  });

  it('closes an issue and answers 204', async () => {
    const asked: Array<CloseIssueInput> = [];
    const call = issues({ close: (input) => Effect.sync(() => void asked.push(input)) });

    const response = await call('/api/v1/projects/pocket-comms/issues/8/close', {
      method: 'POST',
    });

    expect(response.status).toBe(204);
    expect(asked).toEqual([{ project: 'pocket-comms', number: 8 }]);
  });

  it('answers 422 for an issue number that is not one', async () => {
    const call = issues({ close: () => Effect.void });

    const response = await call('/api/v1/projects/pocket-comms/issues/0/close', {
      method: 'POST',
    });

    expect(response.status).toBe(422);
  });

  it.each([
    [new ProjectNotFoundError({ project: 'p' }), 404, 'project-not-found'],
    [new IssueNotFoundError({ number: 8 }), 404, 'issue-not-found'],
    [new NoGiteaRemoteError({ project: 'p' }), 409, 'no-gitea-remote'],
    [new GiteaNotConfiguredError(), 409, 'gitea-not-configured'],
    [
      new GiteaUnavailableError({ reason: 'Gitea refused the token (403).' }),
      503,
      'gitea-unavailable',
    ],
  ] as const)('maps the close failure %s to %i', async (error, status, slug) => {
    const call = issues({ close: () => Effect.fail(error) });

    const response = await call('/api/v1/projects/pocket-comms/issues/8/close', {
      method: 'POST',
    });

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ type: `urn:pocket-comms:problem:${slug}` });
  });

  it('rejects a request without the allowed login', async () => {
    const call = issues({ issues: () => Effect.succeed(listed), close: () => Effect.void });

    expect((await call('/api/v1/projects/pocket-comms/issues', { login: null })).status).toBe(403);
    expect(
      (await call('/api/v1/projects/pocket-comms/issues/8/close', { method: 'POST', login: null }))
        .status,
    ).toBe(403);
  });
});

describe('the activity API', () => {
  const timeline: ActivityDto = {
    events: [
      {
        id: 'e1',
        at: 2_000,
        type: 'prompt',
        excerpt: 'Fix the build',
        images: 1,
        agent: {
          paneId: 'w1:p1',
          ref: 'kirk',
          name: 'kirk',
          workspace: 'feature',
          project: 'app',
          worktree: 'feature',
        },
        live: true,
      },
      {
        id: 'e0',
        at: 1_000,
        type: 'gone',
        agent: {
          paneId: 'w3:p1',
          ref: 'w3:p1',
          name: undefined,
          workspace: 'notes',
          project: undefined,
          worktree: undefined,
        },
        live: false,
      },
    ],
  };

  // A JSON body has no `undefined`: a name the agent has not goes over the wire as `null`.
  const wire = {
    events: [
      timeline.events[0],
      {
        ...timeline.events[1],
        agent: {
          paneId: 'w3:p1',
          ref: 'w3:p1',
          workspace: 'notes',
          name: null,
          project: null,
          worktree: null,
        },
      },
    ],
  };

  it('answers the timeline', async () => {
    const call = serve({}, undefined, {}, {}, {}, {}, { activity: Effect.succeed(timeline) });

    const response = await call('/api/v1/activity');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(wire);
  });

  it('streams the timeline as server-sent events', async () => {
    const call = serve({}, undefined, {}, {}, {}, {}, { activityChanges: Stream.make(timeline) });

    const response = await call('/api/v1/activity/events');

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const text = await response.text();
    expect(text).toContain('event: activity');
    // An event's data is plain JSON text, which leaves a missing name out.
    expect(JSON.parse(text.slice(text.indexOf('data: ') + 6).split('\n')[0] ?? '')).toEqual(
      JSON.parse(JSON.stringify(timeline)),
    );
  });

  it('rejects a request without the allowed login', async () => {
    const call = serve({}, undefined, {}, {}, {}, {}, { activity: Effect.succeed(timeline) });

    expect((await call('/api/v1/activity', { login: null })).status).toBe(403);
  });
});

describe('the brainstorm API', () => {
  const brainstorm = (inbound: Partial<BrainstormInbound['Service']>) =>
    serve({}, undefined, {}, {}, inbound);

  it('reads the chat', async () => {
    const call = brainstorm({
      state: Effect.succeed({
        _tag: 'Ready',
        entries: [{ type: 'user', id: 'u1', at: 1, text: 'Idea' }],
        answering: false,
        live: '',
      }),
    });

    const response = await call('/api/v1/brainstorm');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      _tag: 'Ready',
      entries: [{ type: 'user', id: 'u1', at: 1, text: 'Idea' }],
      answering: false,
      live: '',
    });
  });

  it('follows the chat as server-sent events', async () => {
    const call = brainstorm({
      events: Stream.make({ type: 'delta', text: 'Nice' } as const),
    });

    const response = await call('/api/v1/brainstorm/events');

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await response.text()).toContain(
      'event: brainstorm\ndata: {"type":"delta","text":"Nice"}',
    );
  });

  it('sends a message, decides on a proposal and starts a new chat', async () => {
    const asked: Array<unknown> = [];
    const call = brainstorm({
      send: (text) => Effect.sync(() => void asked.push(['send', text])),
      decide: (id, decision) => Effect.sync(() => void asked.push(['decide', id, decision])),
      reset: () => Effect.sync(() => void asked.push(['reset'])),
    });

    const sent = await call('/api/v1/brainstorm/messages', json({ text: 'Idea' }));
    const decided = await call(
      '/api/v1/brainstorm/proposals/p-1/decision',
      json({ _tag: 'Create', draft: { project: 'app', title: 'Dark mode', body: '' } }),
    );
    const reset = await call('/api/v1/brainstorm/reset', { method: 'POST' });

    expect([sent.status, decided.status, reset.status]).toEqual([204, 204, 204]);
    expect(asked).toEqual([
      ['send', 'Idea'],
      [
        'decide',
        'p-1',
        { _tag: 'Create', draft: { project: 'app', title: 'Dark mode', body: '' } },
      ],
      ['reset'],
    ]);
  });

  it.each([
    [new BrainstormNotSetUpError({ reason: 'Set it.' }), 409, 'brainstorm-not-set-up'],
    [new BrainstormBusyError(), 409, 'brainstorm-busy'],
  ] as const)('maps the send failure %s to %i', async (error, status, slug) => {
    const call = brainstorm({ send: () => Effect.fail(error) });

    const response = await call('/api/v1/brainstorm/messages', json({ text: 'Idea' }));

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ type: `urn:pocket-comms:problem:${slug}` });
  });

  it.each([
    [new ProposalNotFoundError({ id: 'p-1' }), 404, 'proposal-not-found'],
    [new ProposalDecidedError({ id: 'p-1' }), 409, 'proposal-decided'],
    [new BrainstormBusyError(), 409, 'brainstorm-busy'],
    [new NoGiteaRemoteError({ project: 'p' }), 409, 'no-gitea-remote'],
    [new GiteaNotConfiguredError(), 409, 'gitea-not-configured'],
    [new GiteaUnavailableError({ reason: 'Gitea answered 500.' }), 503, 'gitea-unavailable'],
  ] as const)('maps the decision failure %s to %i', async (error, status, slug) => {
    const call = brainstorm({ decide: () => Effect.fail(error) });

    const response = await call(
      '/api/v1/brainstorm/proposals/p-1/decision',
      json({ _tag: 'Discard' }),
    );

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ type: `urn:pocket-comms:problem:${slug}` });
  });

  it('refuses a proposal id that could be a path, and a request without the allowed login', async () => {
    const call = brainstorm({ decide: () => Effect.void, reset: () => Effect.void });

    expect(
      (await call('/api/v1/brainstorm/proposals/a..b/decision', json({ _tag: 'Discard' }))).status,
    ).toBe(422);
    expect((await call('/api/v1/brainstorm/reset', { method: 'POST', login: null })).status).toBe(
      403,
    );
  });
});

describe('the web app', () => {
  it('serves its files and the manifest', async () => {
    const call = serve({}, webDist());

    const script = await call('/assets/app.js');
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toContain('javascript');
    const manifest = await call('/manifest.webmanifest');
    expect(manifest.headers.get('content-type')).toContain('application/manifest+json');
  });

  it.each(['/', '/agents/kirk'])('answers %s with the app page', async (path) => {
    const call = serve({}, webDist());

    const response = await call(path);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>pocket-comms</title>');
  });

  it.each(['/..%2Fsecret.txt', '/assets/..%2F..%2Fsecret.txt', '/../secret.txt'])(
    'never serves a file outside its folder, such as %s',
    async (path) => {
      const parent = mkdtempSync(join(tmpdir(), 'comms-parent-'));
      writeFileSync(join(parent, 'secret.txt'), 'the secret');
      const dist = join(parent, 'dist');
      mkdirSync(dist);
      writeFileSync(join(dist, 'index.html'), '<title>pocket-comms</title>');
      const call = serve({}, dist);

      const body = await (await call(path)).text();

      expect(body).not.toContain('the secret');
      expect(body).toContain('<title>pocket-comms</title>');
    },
  );

  it('serves its files when the folder is given with a trailing slash', async () => {
    const call = serve({}, `${webDist()}/`);

    const script = await call('/assets/app.js');

    expect(await script.text()).toBe('console.log(1)');
  });
});

describe('the images routes (spec 014)', () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
  const ID = 'k5w3x7q2m4n6p3r2s4t6v5x2z4';

  const upload = (bytes: Uint8Array) => ({
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: new Uint8Array(bytes),
  });

  it('keeps an uploaded image and answers its id with 201', async () => {
    let received: Uint8Array | undefined;
    const call = serve(
      {},
      undefined,
      {},
      {},
      {},
      {
        upload: (bytes) => {
          received = bytes;
          return Effect.succeed({ id: ID });
        },
      },
    );

    const response = await call('/api/v1/images', upload(PNG));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: ID });
    expect(Array.from(received ?? [])).toEqual(Array.from(PNG));
  });

  it('answers a validation problem for an image the use case refuses', async () => {
    const call = serve(
      {},
      undefined,
      {},
      {},
      {},
      {
        upload: () =>
          Effect.fail(
            new InvalidInputError({
              issues: [{ field: 'file', message: 'Only JPEG and PNG images can be attached.' }],
            }),
          ),
      },
    );

    const response = await call('/api/v1/images', upload(new TextEncoder().encode('text')));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      type: 'urn:pocket-comms:problem:invalid-request',
    });
  });

  it('sweeps the old images when the server starts', async () => {
    let sweeps = 0;
    const call = serve(
      {},
      undefined,
      {},
      {},
      {},
      {
        sweep: Effect.sync(() => {
          sweeps += 1;
        }),
      },
    );

    await call('/health/live');

    // The sweep runs in a fiber of its own, next to the requests.
    await vi.waitFor(() => expect(sweeps).toBe(1));
  });

  it('answers 503 when the image cannot be kept', async () => {
    const call = serve(
      {},
      undefined,
      {},
      {},
      {},
      {
        upload: () => Effect.fail(new ImageNotSavedError({ reason: 'No space left on device' })),
      },
    );

    const response = await call('/api/v1/images', upload(PNG));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      type: 'urn:pocket-comms:problem:image-not-saved',
      detail: 'No space left on device',
    });
  });

  it('serves an image with its own content type', async () => {
    const call = serve(
      {},
      undefined,
      {},
      {},
      {},
      {
        read: (id) =>
          id === ID ? Effect.succeed({ kind: 'png', bytes: PNG }) : Effect.die('unexpected id'),
      },
    );

    const response = await call(`/api/v1/images/${ID}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it('answers 404 for an unknown image', async () => {
    const call = serve(
      {},
      undefined,
      {},
      {},
      {},
      {
        read: (id) => Effect.fail(new ImageNotFoundError({ id })),
      },
    );

    const response = await call(`/api/v1/images/${ID}`);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      type: 'urn:pocket-comms:problem:image-not-found',
    });
  });

  it('rejects a request without the login with 403', async () => {
    const call = serve({}, undefined, {}, {}, {}, { read: () => Effect.die('not reached') });

    const response = await call(`/api/v1/images/${ID}`, { login: null });

    expect(response.status).toBe(403);
  });

  it('sends a prompt with its images', async () => {
    let sent: unknown;
    const call = serve({
      prompt: (ref, text, imageIds) => {
        sent = { ref, text, imageIds };
        return Effect.void;
      },
    });

    const response = await call('/api/v1/agents/kirk/prompt', json({ text: '', imageIds: [ID] }));

    expect(response.status).toBe(204);
    expect(sent).toEqual({ ref: 'kirk', text: '', imageIds: [ID] });
  });

  it('refuses more than five images in a prompt', async () => {
    const call = serve({ prompt: () => Effect.die('not reached') });

    const response = await call(
      '/api/v1/agents/kirk/prompt',
      json({ text: 'hi', imageIds: Array.from({ length: 6 }, () => ID) }),
    );

    expect(response.status).toBe(422);
  });
});
