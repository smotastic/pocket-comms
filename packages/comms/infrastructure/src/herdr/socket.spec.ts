import { describe, expect, it } from '@effect/vitest';
import { MultiplexerOutbound } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Stream from 'effect/Stream';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  fakeHerdrServer,
  herdrLists,
  type HerdrReply,
  type HerdrRequest,
} from '../testing/herdr-server.js';
import { layerSocket } from './socket.js';

/** Herdr with one Claude agent in `wJ:p1`, whose status fields `status` reads at each list. */
const oneAgent =
  (status: () => object) =>
  (request: HerdrRequest): HerdrReply =>
    request.method === 'agent.list'
      ? {
          result: {
            type: 'agent_list',
            agents: [
              {
                pane_id: 'wJ:p1',
                workspace_id: 'wJ',
                agent: 'claude',
                terminal_title: '✳ A task',
                terminal_title_stripped: 'A task',
                ...status(),
              },
            ],
          },
        }
      : herdrLists([])(request);

const lists = (request: HerdrRequest) => {
  if (request.method === 'agent.list') {
    return {
      result: {
        type: 'agent_list',
        agents: [
          {
            terminal_id: 'term_1',
            name: 'kirk',
            agent: 'claude',
            terminal_title: '✳ Pocket-home ingestor',
            terminal_title_stripped: 'Pocket-home ingestor',
            agent_status: 'done',
            agent_session: { source: 'herdr:claude', agent: 'claude', kind: 'id', value: 's-1' },
            workspace_id: 'wJ',
            pane_id: 'wJ:p1',
            focused: false,
            completion_seq: 1502,
            cwd: '/work/home/feat',
          },
          {
            agent: 'codex',
            terminal_title: 'codex',
            agent_status: 'surprised',
            workspace_id: 'w9',
            pane_id: 'w9:p2',
          },
        ],
      },
    };
  }
  if (request.method === 'workspace.list') {
    return {
      result: {
        type: 'workspace_list',
        workspaces: [
          {
            workspace_id: 'wJ',
            label: 'ingestor-mvp',
            worktree: {
              checkout_path: '/worktrees/home/feat-ingestor-mvp',
              is_linked_worktree: true,
              repo_key: '/work/home/.git',
              repo_name: 'pocket-home',
              repo_root: '/work/home',
            },
          },
          {
            workspace_id: 'wH',
            label: 'pocket-home',
            worktree: {
              checkout_path: '/work/home',
              is_linked_worktree: false,
              repo_key: '/work/home/.git',
              repo_name: 'pocket-home',
              repo_root: '/work/home',
            },
          },
          { workspace_id: 'w9', label: 'notes' },
        ],
      },
    };
  }
  if (request.method === 'agent.read') {
    return {
      result: { type: 'pane_read', read: { pane_id: 'wJ:p1', text: '\u001b[1mHi\u001b[0m' } },
    };
  }
  if (request.method === 'worktree.open') {
    return {
      result: {
        type: 'worktree_opened',
        workspace: { workspace_id: 'wK', label: 'New task' },
        tab: { tab_id: 'wK:t1' },
        root_pane: { pane_id: 'wK:p1', workspace_id: 'wK' },
        worktree: { path: '/worktrees/home/feat-new', branch: 'feat/new' },
        already_open: false,
      },
    };
  }
  if (request.method === 'agent.start') {
    return {
      result: {
        type: 'agent_started',
        argv: ['claude'],
        agent: { pane_id: 'wK:p1', agent_status: 'idle', interactive_ready: true },
      },
    };
  }
  if (request.method === 'workspace.close') {
    return request.params['workspace_id'] === 'wGone'
      ? { error: { code: 'workspace_not_found', message: 'workspace wGone not found' } }
      : { result: { type: 'ok' } };
  }
  if (request.method === 'pane.send_text' && request.params['text'] === 'refuse') {
    return { error: { code: 'pane_not_found', message: 'pane wJ:p1 not found' } };
  }
  if (request.method === 'agent.prompt' && request.params['text'] === 'refuse') {
    return { error: { code: 'agent_not_ready', message: 'agent wJ:p1 is not ready' } };
  }
  return { result: { type: 'ok' } };
};

describe('Herdr.layerSocket', () => {
  it.live('names itself Herdr', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const multiplexer = yield* MultiplexerOutbound.use((herdr) =>
        Effect.succeed(herdr.multiplexer),
      ).pipe(Effect.provide(layerSocket({ path: server.path })));

      expect(multiplexer).toBe('herdr');
    }).pipe(Effect.scoped),
  );

  it.live('reads the agents and the workspaces', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const snapshot = yield* MultiplexerOutbound.use((herdr) => herdr.snapshot).pipe(
        Effect.provide(layerSocket({ path: server.path })),
      );

      expect(snapshot).toEqual({
        agents: [
          {
            paneId: 'wJ:p1',
            name: 'kirk',
            kind: 'claude',
            status: 'done',
            title: 'Pocket-home ingestor',
            workspaceId: 'wJ',
            cwd: '/work/home/feat',
            session: 's-1',
            completion: 1502,
          },
          {
            paneId: 'w9:p2',
            name: undefined,
            kind: 'codex',
            status: 'unknown',
            title: 'codex',
            workspaceId: 'w9',
            cwd: undefined,
            session: undefined,
            completion: undefined,
          },
        ],
        workspaces: [
          {
            id: 'wJ',
            label: 'ingestor-mvp',
            group: { key: '/work/home/.git', name: 'pocket-home' },
            root: '/work/home',
            project: 'pocket-home',
            worktree: 'ingestor-mvp',
            checkout: '/worktrees/home/feat-ingestor-mvp',
          },
          {
            id: 'wH',
            label: 'pocket-home',
            group: { key: '/work/home/.git', name: 'pocket-home' },
            root: '/work/home',
            project: 'pocket-home',
            checkout: '/work/home',
          },
          { id: 'w9', label: 'notes', group: { key: 'other', name: 'Other' } },
        ],
      });
    }).pipe(Effect.scoped),
  );

  it.live('reads the visible screen with its colours', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const screen = yield* MultiplexerOutbound.use((herdr) => herdr.readScreen('wJ:p1')).pipe(
        Effect.provide(layerSocket({ path: server.path })),
      );

      expect(screen).toBe('\u001b[1mHi\u001b[0m');
      expect(server.requests.at(-1)).toMatchObject({
        method: 'agent.read',
        params: { target: 'wJ:p1', source: 'visible', format: 'ansi', strip_ansi: false },
      });
    }).pipe(Effect.scoped),
  );

  it.live('sends a prompt and keys to the target', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      yield* MultiplexerOutbound.use((herdr) =>
        Effect.andThen(herdr.prompt('wJ:p1', 'hello'), herdr.sendKeys('wJ:p1', ['1', 'enter'])),
      ).pipe(Effect.provide(layerSocket({ path: server.path })));

      expect(server.requests.map((request) => [request.method, request.params])).toEqual([
        ['agent.get', { target: 'wJ:p1' }],
        ['agent.prompt', { target: 'wJ:p1', text: 'hello' }],
        ['agent.send_keys', { target: 'wJ:p1', keys: ['1'] }],
        ['agent.send_keys', { target: 'wJ:p1', keys: ['enter'] }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('opens an existing worktree and a new shell, without moving the focus', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer((request) => {
        if (request.method === 'worktree.open') {
          return {
            result: {
              type: 'worktree_opened',
              workspace: { workspace_id: 'w3', label: 'proj-wt' },
              tab: { tab_id: 'w3:t1' },
              root_pane: { pane_id: 'w3:p1', workspace_id: 'w3' },
              worktree: { path: '/worktrees/fix-12-login', branch: 'fix/12-login' },
              already_open: true,
            },
          };
        }
        if (request.method === 'tab.create') {
          return {
            result: {
              type: 'tab_created',
              tab: { tab_id: 'w3:t2', workspace_id: 'w3' },
              root_pane: { pane_id: 'w3:p2', workspace_id: 'w3' },
            },
          };
        }
        return lists(request);
      });
      const [opened, shell] = yield* MultiplexerOutbound.use((herdr) =>
        Effect.all([
          herdr.openWorktree({
            cwd: '/work/app',
            path: '/worktrees/fix-12-login',
            label: 'Fix login',
          }),
          herdr.openShell('w3'),
        ]),
      ).pipe(Effect.provide(layerSocket({ path: server.path })));

      expect(opened).toEqual({ workspaceId: 'w3', paneId: 'w3:p1', alreadyOpen: true });
      expect(shell).toEqual({ workspaceId: 'w3', paneId: 'w3:p2' });
      expect(server.requests.map((request) => [request.method, request.params])).toEqual([
        [
          'worktree.open',
          { cwd: '/work/app', path: '/worktrees/fix-12-login', label: 'Fix login', focus: false },
        ],
        ['tab.create', { workspace_id: 'w3', focus: false }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('reads an agent, which lets Herdr finish its start', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer((request) =>
        request.method === 'agent.get'
          ? {
              result: {
                type: 'agent_info',
                agent: { pane_id: 'wK:p1', agent_status: 'idle', interactive_ready: true },
              },
            }
          : lists(request),
      );
      const agent = yield* MultiplexerOutbound.use((herdr) => herdr.readAgent('wK:p1')).pipe(
        Effect.provide(layerSocket({ path: server.path })),
      );

      expect(agent).toEqual({ status: 'idle', ready: true });
      expect(server.requests.map((request) => [request.method, request.params])).toEqual([
        ['agent.get', { target: 'wK:p1' }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('reports an agent whose start Herdr still holds as not ready', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer((request) =>
        request.method === 'agent.get'
          ? {
              result: {
                type: 'agent_info',
                agent: { pane_id: 'wK:p1', agent_status: 'idle', launch_pending: true },
              },
            }
          : lists(request),
      );
      const agent = yield* MultiplexerOutbound.use((herdr) => herdr.readAgent('wK:p1')).pipe(
        Effect.provide(layerSocket({ path: server.path })),
      );

      expect(agent).toEqual({ status: 'idle', ready: false });
    }).pipe(Effect.scoped),
  );

  it.live('still sends the prompt when Herdr cannot read the agent first', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer((request) =>
        request.method === 'agent.get'
          ? { error: { code: 'agent_not_found', message: 'agent wJ:p1 not found' } }
          : lists(request),
      );
      yield* MultiplexerOutbound.use((herdr) => herdr.prompt('wJ:p1', 'hello')).pipe(
        Effect.provide(layerSocket({ path: server.path })),
      );

      expect(server.requests.map((request) => request.method)).toEqual([
        'agent.get',
        'agent.prompt',
      ]);
    }).pipe(Effect.scoped),
  );

  it.live("presses the fourth option's digit by its key name, as the others", () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      yield* MultiplexerOutbound.use((herdr) => herdr.sendKeys('wJ:p1', ['4', 'right', '1'])).pipe(
        Effect.provide(layerSocket({ path: server.path })),
      );

      expect(server.requests.map((request) => [request.method, request.params])).toEqual([
        ['agent.send_keys', { target: 'wJ:p1', keys: ['4'] }],
        ['agent.send_keys', { target: 'wJ:p1', keys: ['right'] }],
        ['agent.send_keys', { target: 'wJ:p1', keys: ['1'] }],
      ]);
    }).pipe(Effect.scoped),
  );

  // Claude's dialog takes keys that arrive together as one input and ignores it, so the answers to
  // several questions left it untouched (Claude Code v2.1.323).
  it.live('sends each key alone, a pause after the one before', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const started = Date.now();
      yield* MultiplexerOutbound.use((herdr) => herdr.sendKeys('wJ:p1', ['2', '1', '1'])).pipe(
        Effect.provide(layerSocket({ path: server.path, keyGap: '40 millis' })),
      );

      expect(Date.now() - started).toBeGreaterThanOrEqual(80);
      expect(server.requests.map((request) => request.params['keys'])).toEqual([
        ['2'],
        ['1'],
        ['1'],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('pages with the terminal sequences, which Herdr has no key names for, in order', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      yield* MultiplexerOutbound.use((herdr) =>
        herdr.sendKeys('wJ:p1', ['pageup', 'pageup', 'down', 'pagedown']),
      ).pipe(Effect.provide(layerSocket({ path: server.path })));

      expect(server.requests.map((request) => [request.method, request.params])).toEqual([
        ['pane.send_text', { pane_id: 'wJ:p1', text: '\u001b[5~' }],
        ['pane.send_text', { pane_id: 'wJ:p1', text: '\u001b[5~' }],
        ['agent.send_keys', { target: 'wJ:p1', keys: ['down'] }],
        ['pane.send_text', { pane_id: 'wJ:p1', text: '\u001b[6~' }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live(
    'keeps an agent paged away from its question waiting until Herdr reports another status',
    () =>
      Effect.gen(function* () {
        let herdrStatus: object = { agent_status: 'blocked' };
        const server = yield* fakeHerdrServer(oneAgent(() => herdrStatus));
        const statuses = MultiplexerOutbound.use((herdr) => herdr.snapshot).pipe(
          Effect.map(({ agents }) => agents.map((agent) => [agent.status, agent.completion])),
        );
        yield* Effect.gen(function* () {
          expect(yield* statuses).toEqual([['blocked', undefined]]);
          yield* MultiplexerOutbound.use((herdr) => herdr.sendKeys('wJ:p1', ['pageup']));
          herdrStatus = { agent_status: 'done', completion_seq: 8 };
          expect(yield* statuses).toEqual([['blocked', undefined]]);
          herdrStatus = { agent_status: 'idle', completion_seq: 8 };
          expect(yield* statuses).toEqual([['blocked', undefined]]);
          herdrStatus = { agent_status: 'blocked' };
          expect(yield* statuses).toEqual([['blocked', undefined]]);
          // Back at its question, a later done is a finished turn again.
          herdrStatus = { agent_status: 'done', completion_seq: 9 };
          expect(yield* statuses).toEqual([['done', 9]]);
        }).pipe(Effect.provide(layerSocket({ path: server.path })));
      }).pipe(Effect.scoped),
  );

  it.live('ends the paging with any other input, such as Escape or a typed answer', () =>
    Effect.gen(function* () {
      let herdrStatus: object = { agent_status: 'blocked' };
      const server = yield* fakeHerdrServer(oneAgent(() => herdrStatus));
      const status = MultiplexerOutbound.use((herdr) => herdr.snapshot).pipe(
        Effect.map(({ agents }) => agents.map((agent) => agent.status)),
      );
      yield* Effect.gen(function* () {
        yield* status;
        yield* MultiplexerOutbound.use((herdr) => herdr.sendKeys('wJ:p1', ['pageup']));
        yield* MultiplexerOutbound.use((herdr) => herdr.sendKeys('wJ:p1', ['esc']));
        herdrStatus = { agent_status: 'idle', completion_seq: 8 };
        expect(yield* status).toEqual(['idle']);

        herdrStatus = { agent_status: 'blocked' };
        yield* status;
        yield* MultiplexerOutbound.use((herdr) => herdr.sendKeys('wJ:p1', ['pageup']));
        yield* MultiplexerOutbound.use((herdr) => herdr.typeText('wJ:p1', 'Use SQLite'));
        herdrStatus = { agent_status: 'done', completion_seq: 9 };
        expect(yield* status).toEqual(['done']);
      }).pipe(Effect.provide(layerSocket({ path: server.path })));
    }).pipe(Effect.scoped),
  );

  it.live('does not hold an agent that did not wait when it was paged', () =>
    Effect.gen(function* () {
      let herdrStatus: object = { agent_status: 'idle' };
      const server = yield* fakeHerdrServer(oneAgent(() => herdrStatus));
      yield* Effect.gen(function* () {
        yield* MultiplexerOutbound.use((herdr) => herdr.snapshot);
        yield* MultiplexerOutbound.use((herdr) => herdr.sendKeys('wJ:p1', ['pageup']));
        herdrStatus = { agent_status: 'done', completion_seq: 8 };
        const { agents } = yield* MultiplexerOutbound.use((herdr) => herdr.snapshot);
        expect(agents.map((agent) => agent.status)).toEqual(['done']);
      }).pipe(Effect.provide(layerSocket({ path: server.path })));
    }).pipe(Effect.scoped),
  );

  it.live('types text into the pane without pressing Enter', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      yield* MultiplexerOutbound.use((herdr) => herdr.typeText('wJ:p1', 'Use SQLite')).pipe(
        Effect.provide(layerSocket({ path: server.path })),
      );

      expect(server.requests.map((request) => [request.method, request.params])).toEqual([
        ['pane.send_text', { pane_id: 'wJ:p1', text: 'Use SQLite' }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('closes a workspace, never trusting the repository', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      yield* MultiplexerOutbound.use((herdr) => herdr.closeWorkspace('wJ')).pipe(
        Effect.provide(layerSocket({ path: server.path })),
      );

      expect(server.requests.map((request) => [request.method, request.params])).toEqual([
        ['workspace.close', { workspace_id: 'wJ' }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live("reports Herdr's refusal to close a workspace", () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const error = yield* MultiplexerOutbound.use((herdr) => herdr.closeWorkspace('wGone')).pipe(
        Effect.provide(layerSocket({ path: server.path })),
        Effect.flip,
      );

      expect(error).toMatchObject({
        _tag: 'MultiplexerRejectedError',
        ref: 'wGone',
        code: 'workspace_not_found',
      });
    }).pipe(Effect.scoped),
  );

  it.live('starts an agent with only the configured arguments', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const start = (kind: 'claude' | 'pi') =>
        MultiplexerOutbound.use((herdr) =>
          herdr.startAgent({ paneId: 'wK:p1', name: 'feat-new', kind }),
        );
      const started = yield* start('claude').pipe(
        Effect.provide(layerSocket({ path: server.path })),
      );
      yield* start('pi').pipe(
        Effect.provide(layerSocket({ path: server.path, agentArgs: ['--model', 'x'] })),
      );

      expect(started).toEqual({ status: 'idle', ready: true });
      expect(server.requests.map((request) => request.params)).toEqual([
        { name: 'feat-new', kind: 'claude', pane_id: 'wK:p1', args: [], timeout_ms: 30_000 },
        {
          name: 'feat-new',
          kind: 'pi',
          pane_id: 'wK:p1',
          args: ['--model', 'x'],
          timeout_ms: 30_000,
        },
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('waits for a new pane to reach its prompt before it starts the agent', () =>
    Effect.gen(function* () {
      let refusals = 2;
      const server = yield* fakeHerdrServer((request) => {
        if (request.method === 'agent.start' && refusals > 0) {
          refusals -= 1;
          return {
            error: {
              code: 'invalid_target',
              message: 'agent target pane wK:p1 is not an available shell',
            },
          };
        }
        return lists(request);
      });
      const started = yield* MultiplexerOutbound.use((herdr) =>
        herdr.startAgent({ paneId: 'wK:p1', name: 'feat-new', kind: 'claude' }),
      ).pipe(Effect.provide(layerSocket({ path: server.path })));

      expect(started).toEqual({ status: 'idle', ready: true });
      expect(server.requests.filter((request) => request.method === 'agent.start')).toHaveLength(3);
    }).pipe(Effect.scoped),
  );

  it.live('stops waiting for the prompt after the shell wait', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer((request) =>
        request.method === 'agent.start'
          ? {
              error: {
                code: 'invalid_target',
                message: 'agent target pane wK:p1 is not an available shell',
              },
            }
          : lists(request),
      );
      const error = yield* MultiplexerOutbound.use((herdr) =>
        herdr.startAgent({ paneId: 'wK:p1', name: 'feat-new', kind: 'claude' }),
      ).pipe(
        Effect.provide(layerSocket({ path: server.path, shellWait: '500 millis' })),
        Effect.flip,
      );

      expect(error).toMatchObject({
        _tag: 'MultiplexerRejectedError',
        message: 'agent target pane wK:p1 is not an available shell',
      });
      expect(
        server.requests.filter((request) => request.method === 'agent.start').length,
      ).toBeLessThanOrEqual(3);
    }).pipe(Effect.scoped),
  );

  it.live('reports an error answer as a refusal', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const error = yield* MultiplexerOutbound.use((herdr) => herdr.prompt('wJ:p1', 'refuse')).pipe(
        Effect.provide(layerSocket({ path: server.path })),
        Effect.flip,
      );

      expect(error).toMatchObject({
        _tag: 'MultiplexerRejectedError',
        ref: 'wJ:p1',
        code: 'agent_not_ready',
        message: 'agent wJ:p1 is not ready',
      });
    }).pipe(Effect.scoped),
  );

  it.live('reports a refused text as a refusal', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const error = yield* MultiplexerOutbound.use((herdr) =>
        herdr.typeText('wJ:p1', 'refuse'),
      ).pipe(Effect.provide(layerSocket({ path: server.path })), Effect.flip);

      expect(error).toMatchObject({
        _tag: 'MultiplexerRejectedError',
        ref: 'wJ:p1',
        code: 'pane_not_found',
      });
    }).pipe(Effect.scoped),
  );

  it.live('reports a missing socket as unavailable', () =>
    Effect.gen(function* () {
      const error = yield* MultiplexerOutbound.use((herdr) => herdr.snapshot).pipe(
        Effect.provide(layerSocket({ path: join(tmpdir(), 'no-herdr', 'herdr.sock') })),
        Effect.flip,
      );

      expect(error._tag).toBe('MultiplexerUnavailableError');
    }),
  );

  it.live('reports a silent socket as unavailable after the timeout', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(() => 'silent');
      const error = yield* MultiplexerOutbound.use((herdr) => herdr.snapshot).pipe(
        Effect.provide(layerSocket({ path: server.path, timeout: '50 millis' })),
        Effect.flip,
      );

      expect(error._tag).toBe('MultiplexerUnavailableError');
    }).pipe(Effect.scoped),
  );
});

describe('Herdr.layerSocket changes', () => {
  it.live('subscribes to the status of every pane and emits on an event', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(herdrLists(['w1:p1', 'w1:p2']));
      const fiber = yield* MultiplexerOutbound.use((herdr) =>
        // The first item is the re-list tick at the start; the second is the event.
        herdr.changes.pipe(Stream.take(2), Stream.runCollect),
      ).pipe(
        Effect.provide(layerSocket({ path: server.path, relistInterval: '10 seconds' })),
        Effect.forkChild,
      );
      yield* Effect.sleep('100 millis');

      const [subscription] = server.subscribers();
      expect(subscription?.params['subscriptions']).toEqual(
        expect.arrayContaining([
          { type: 'pane.created' },
          { type: 'pane.closed' },
          { type: 'pane.agent_detected' },
          { type: 'workspace.renamed' },
          { type: 'pane.agent_status_changed', pane_id: 'w1:p1' },
          { type: 'pane.agent_status_changed', pane_id: 'w1:p2' },
        ]),
      );
      server.emit({ event: 'pane_agent_status_changed', data: { pane_id: 'w1:p1' } });
      expect(yield* Fiber.join(fiber)).toHaveLength(2);
    }).pipe(Effect.scoped),
  );

  it.live('subscribes again when the set of panes changes', () =>
    Effect.gen(function* () {
      let panes = ['w1:p1'];
      const server = yield* fakeHerdrServer((request) => herdrLists(panes)(request));
      yield* MultiplexerOutbound.use((herdr) => herdr.changes.pipe(Stream.runDrain)).pipe(
        Effect.provide(layerSocket({ path: server.path, relistInterval: '30 millis' })),
        Effect.forkChild,
      );
      yield* Effect.sleep('100 millis');

      panes = ['w1:p1', 'w1:p3'];
      yield* Effect.sleep('200 millis');

      const subscriptions = server.subscribers().map((request) => request.params['subscriptions']);
      expect(subscriptions).toEqual([
        expect.arrayContaining([{ type: 'pane.agent_status_changed', pane_id: 'w1:p3' }]),
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('waits one interval before it subscribes again after Herdr ends a subscription', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(herdrLists(['w1:p1']));
      const subscribes = () =>
        server.requests.filter((request) => request.method === 'events.subscribe').length;
      yield* MultiplexerOutbound.use((herdr) => herdr.changes.pipe(Stream.runDrain)).pipe(
        Effect.provide(layerSocket({ path: server.path, relistInterval: '200 millis' })),
        Effect.forkChild,
      );
      yield* Effect.sleep('100 millis');
      expect(subscribes()).toBe(1);

      server.closeSubscribers();
      yield* Effect.sleep('50 millis');
      expect(subscribes()).toBe(1);
      yield* Effect.sleep('300 millis');
      expect(subscribes()).toBe(2);
    }).pipe(Effect.scoped),
  );

  it.live('emits at least once per re-list interval, also while Herdr is away', () =>
    Effect.gen(function* () {
      const emitted = yield* MultiplexerOutbound.use((herdr) =>
        herdr.changes.pipe(Stream.take(3), Stream.runCollect),
      ).pipe(
        Effect.provide(
          layerSocket({
            path: join(tmpdir(), 'no-herdr', 'herdr.sock'),
            relistInterval: '20 millis',
          }),
        ),
      );

      expect(emitted).toHaveLength(3);
    }),
  );

  it.live('never asks Herdr to focus anything', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      yield* MultiplexerOutbound.use((herdr) =>
        Effect.all([
          herdr.snapshot,
          herdr.readScreen('wJ:p1'),
          herdr.prompt('wJ:p1', 'hi'),
          herdr.sendKeys('wJ:p1', ['esc']),
          herdr.openWorktree({ cwd: '/work/home', path: '/worktrees/home/feat-new', label: 'l' }),
          herdr.startAgent({ paneId: 'wK:p1', name: 'feat-new', kind: 'claude' }),
          herdr.closeWorkspace('wJ'),
          herdr.changes.pipe(Stream.take(1), Stream.runDrain),
        ]),
      ).pipe(Effect.provide(layerSocket({ path: server.path, relistInterval: '20 millis' })));

      expect(server.requests.length).toBeGreaterThan(7);
      expect(server.requests.filter((request) => request.method.endsWith('focus'))).toEqual([]);
    }).pipe(Effect.scoped),
  );
});
