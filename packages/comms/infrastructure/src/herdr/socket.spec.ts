import { describe, expect, it } from '@effect/vitest';
import { HerdrOutbound } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Stream from 'effect/Stream';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fakeHerdrServer, herdrLists, type HerdrRequest } from '../testing/herdr-server.js';
import { layerSocket } from './socket.js';

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
  if (request.method === 'worktree.create') {
    return {
      result: {
        type: 'worktree_created',
        workspace: { workspace_id: 'wK', label: 'New task', focused: false },
        tab: { tab_id: 'wK:t1' },
        root_pane: { pane_id: 'wK:p1', workspace_id: 'wK' },
        worktree: { path: '/worktrees/home/feat-new', branch: 'feat/new', label: 'New task' },
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
  if (request.method === 'worktree.remove') {
    return request.params['workspace_id'] === 'wDirty'
      ? { error: { code: 'worktree_remove_failed', message: 'worktree contains modified files' } }
      : {
          result: {
            type: 'worktree_removed',
            workspace_id: request.params['workspace_id'],
            path: '/worktrees/home/feat-ingestor-mvp',
            forced: request.params['force'],
          },
        };
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
  it.live('reads the agents and the workspaces', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const snapshot = yield* HerdrOutbound.use((herdr) => herdr.snapshot).pipe(
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
      const screen = yield* HerdrOutbound.use((herdr) => herdr.readScreen('wJ:p1')).pipe(
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
      yield* HerdrOutbound.use((herdr) =>
        Effect.andThen(herdr.prompt('wJ:p1', 'hello'), herdr.sendKeys('wJ:p1', ['1', 'enter'])),
      ).pipe(Effect.provide(layerSocket({ path: server.path })));

      expect(server.requests.map((request) => [request.method, request.params])).toEqual([
        ['agent.prompt', { target: 'wJ:p1', text: 'hello' }],
        ['agent.send_keys', { target: 'wJ:p1', keys: ['1', 'enter'] }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('types text into the pane without pressing Enter', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      yield* HerdrOutbound.use((herdr) => herdr.typeText('wJ:p1', 'Use SQLite')).pipe(
        Effect.provide(layerSocket({ path: server.path })),
      );

      expect(server.requests.map((request) => [request.method, request.params])).toEqual([
        ['pane.send_text', { pane_id: 'wJ:p1', text: 'Use SQLite' }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('creates a worktree without moving the focus', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const created = yield* HerdrOutbound.use((herdr) =>
        herdr.createWorktree({
          cwd: '/work/home',
          branch: 'feat/new',
          base: 'origin/master',
          label: 'New task',
        }),
      ).pipe(Effect.provide(layerSocket({ path: server.path })));

      expect(created).toEqual({
        workspaceId: 'wK',
        paneId: 'wK:p1',
        path: '/worktrees/home/feat-new',
        branch: 'feat/new',
      });
      expect(server.requests.map((request) => [request.method, request.params])).toEqual([
        [
          'worktree.create',
          {
            cwd: '/work/home',
            branch: 'feat/new',
            base: 'origin/master',
            label: 'New task',
            focus: false,
          },
        ],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('removes a worktree with the force asked for, never trusting the repository', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      yield* HerdrOutbound.use((herdr) =>
        Effect.andThen(
          herdr.removeWorktree({ workspaceId: 'wJ', force: false }),
          herdr.removeWorktree({ workspaceId: 'wJ', force: true }),
        ),
      ).pipe(Effect.provide(layerSocket({ path: server.path })));

      expect(server.requests.map((request) => [request.method, request.params])).toEqual([
        ['worktree.remove', { workspace_id: 'wJ', force: false }],
        ['worktree.remove', { workspace_id: 'wJ', force: true }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live("reports Herdr's refusal to remove a worktree", () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const error = yield* HerdrOutbound.use((herdr) =>
        herdr.removeWorktree({ workspaceId: 'wDirty', force: false }),
      ).pipe(Effect.provide(layerSocket({ path: server.path })), Effect.flip);

      expect(error).toMatchObject({
        _tag: 'HerdrRejectedError',
        ref: 'wDirty',
        code: 'worktree_remove_failed',
      });
    }).pipe(Effect.scoped),
  );

  it.live('starts an agent with only the configured arguments', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const start = (kind: 'claude' | 'pi') =>
        HerdrOutbound.use((herdr) => herdr.startAgent({ paneId: 'wK:p1', name: 'feat-new', kind }));
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
      const started = yield* HerdrOutbound.use((herdr) =>
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
      const error = yield* HerdrOutbound.use((herdr) =>
        herdr.startAgent({ paneId: 'wK:p1', name: 'feat-new', kind: 'claude' }),
      ).pipe(
        Effect.provide(layerSocket({ path: server.path, shellWait: '500 millis' })),
        Effect.flip,
      );

      expect(error).toMatchObject({
        _tag: 'HerdrRejectedError',
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
      const error = yield* HerdrOutbound.use((herdr) => herdr.prompt('wJ:p1', 'refuse')).pipe(
        Effect.provide(layerSocket({ path: server.path })),
        Effect.flip,
      );

      expect(error).toMatchObject({
        _tag: 'HerdrRejectedError',
        ref: 'wJ:p1',
        code: 'agent_not_ready',
        message: 'agent wJ:p1 is not ready',
      });
    }).pipe(Effect.scoped),
  );

  it.live('reports a refused text as a refusal', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(lists);
      const error = yield* HerdrOutbound.use((herdr) => herdr.typeText('wJ:p1', 'refuse')).pipe(
        Effect.provide(layerSocket({ path: server.path })),
        Effect.flip,
      );

      expect(error).toMatchObject({
        _tag: 'HerdrRejectedError',
        ref: 'wJ:p1',
        code: 'pane_not_found',
      });
    }).pipe(Effect.scoped),
  );

  it.live('reports a missing socket as unavailable', () =>
    Effect.gen(function* () {
      const error = yield* HerdrOutbound.use((herdr) => herdr.snapshot).pipe(
        Effect.provide(layerSocket({ path: join(tmpdir(), 'no-herdr', 'herdr.sock') })),
        Effect.flip,
      );

      expect(error._tag).toBe('HerdrUnavailableError');
    }),
  );

  it.live('reports a silent socket as unavailable after the timeout', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(() => 'silent');
      const error = yield* HerdrOutbound.use((herdr) => herdr.snapshot).pipe(
        Effect.provide(layerSocket({ path: server.path, timeout: '50 millis' })),
        Effect.flip,
      );

      expect(error._tag).toBe('HerdrUnavailableError');
    }).pipe(Effect.scoped),
  );
});

describe('Herdr.layerSocket changes', () => {
  it.live('subscribes to the status of every pane and emits on an event', () =>
    Effect.gen(function* () {
      const server = yield* fakeHerdrServer(herdrLists(['w1:p1', 'w1:p2']));
      const fiber = yield* HerdrOutbound.use((herdr) =>
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
      yield* HerdrOutbound.use((herdr) => herdr.changes.pipe(Stream.runDrain)).pipe(
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
      yield* HerdrOutbound.use((herdr) => herdr.changes.pipe(Stream.runDrain)).pipe(
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
      const emitted = yield* HerdrOutbound.use((herdr) =>
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
      yield* HerdrOutbound.use((herdr) =>
        Effect.all([
          herdr.snapshot,
          herdr.readScreen('wJ:p1'),
          herdr.prompt('wJ:p1', 'hi'),
          herdr.sendKeys('wJ:p1', ['esc']),
          herdr.createWorktree({ cwd: '/work/home', branch: 'feat/new', base: 'b', label: 'l' }),
          herdr.startAgent({ paneId: 'wK:p1', name: 'feat-new', kind: 'claude' }),
          herdr.removeWorktree({ workspaceId: 'wJ', force: false }),
          herdr.changes.pipe(Stream.take(1), Stream.runDrain),
        ]),
      ).pipe(Effect.provide(layerSocket({ path: server.path, relistInterval: '20 millis' })));

      expect(server.requests.length).toBeGreaterThan(7);
      expect(server.requests.filter((request) => request.method.endsWith('focus'))).toEqual([]);
    }).pipe(Effect.scoped),
  );
});
