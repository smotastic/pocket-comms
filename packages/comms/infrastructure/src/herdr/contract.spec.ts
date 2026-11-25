import * as Effect from 'effect/Effect';
import { fakeHerdrServer, type HerdrReply, type HerdrRequest } from '../testing/herdr-server.js';
import { describeMultiplexer } from '../testing/multiplexer-contract.js';
import { layerSocket } from './socket.js';

const kirk = {
  pane_id: 'wJ:p1',
  workspace_id: 'wJ',
  name: 'kirk',
  agent: 'claude',
  agent_status: 'idle',
  interactive_ready: true,
  terminal_title_stripped: 'A task',
};

const opened = (workspace: string) => ({
  workspace: { workspace_id: workspace },
  root_pane: { pane_id: `${workspace}:p1`, workspace_id: workspace },
});

const reply = (request: HerdrRequest): HerdrReply => {
  const target = request.params['target'];
  switch (request.method) {
    case 'agent.list':
      return { result: { agents: [kirk] } };
    case 'workspace.list':
      return { result: { workspaces: [{ workspace_id: 'wJ', label: 'Fix x' }] } };
    case 'agent.read':
      return { result: { read: { pane_id: 'wJ:p1', text: 'the screen' } } };
    case 'agent.get':
      return target === 'kirk' || target === 'wJ:p1'
        ? { result: { agent: kirk } }
        : { error: { code: 'agent_not_found', message: `agent ${String(target)} not found` } };
    case 'worktree.open':
      return { result: { ...opened('wK'), already_open: false } };
    case 'tab.create':
      return { result: { root_pane: { pane_id: 'wK:p2', workspace_id: 'wK' } } };
    case 'agent.start':
      return { result: { agent: { ...kirk, pane_id: 'wK:p1', name: 'feat-y' } } };
    default:
      return { result: { type: 'ok' } };
  }
};

describeMultiplexer(
  'Herdr',
  Effect.map(fakeHerdrServer(reply), (server) => ({
    layer: layerSocket({ path: server.path, relistInterval: '20 millis' }),
  })),
  (path) => layerSocket({ path, relistInterval: '20 millis' }),
);
