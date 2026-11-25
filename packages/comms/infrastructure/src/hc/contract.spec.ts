import * as Effect from 'effect/Effect';
import { fakeHcServer, hcTerminal, type HcReply, type HcRequest } from '../testing/hc-server.js';
import { describeMultiplexer } from '../testing/multiplexer-contract.js';
import { layerSocket } from './socket.js';

const kirk = hcTerminal({
  address: 't2',
  name: 'kirk',
  cwd: '/worktrees/app/feat-x',
  foreground: { name: 'claude', cwd: '/worktrees/app/feat-x', argv: ['claude'] },
  labels: {
    'comms.agent': 'claude',
    'comms.workspace': '/worktrees/app/feat-x',
    'comms.label': 'Fix x',
  },
  status: { app: 'claude-code', state: 'idle' },
});

const reply = (request: HcRequest): HcReply => {
  const target = request.params['terminal'];
  switch (request.method) {
    case 'terminal.list':
      return { result: { terminals: [kirk] } };
    case 'terminal.get':
      return target === 'kirk' || target === 't2'
        ? { result: kirk }
        : target === 't9'
          ? { result: hcTerminal({ address: 't9', cwd: '/worktrees/app/feat-y' }) }
          : { error: { kind: 'not_found', message: `no terminal "${String(target)}"` } };
    case 'terminal.read':
      return { result: { text: 'the screen' } };
    case 'terminal.run':
      return {
        result: hcTerminal({
          address: 't9',
          cwd: request.params['cwd'],
          labels: request.params['labels'] ?? {},
        }),
      };
    default:
      return { result: {} };
  }
};

describeMultiplexer(
  'hc',
  Effect.map(fakeHcServer(reply), (server) => ({
    layer: layerSocket({ path: server.path, relistInterval: '20 millis', keyGap: '1 millis' }),
  })),
  (path) => layerSocket({ path, relistInterval: '20 millis' }),
);
