import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Observability } from '@pocket-comms/backend-shared/observability';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { server } from './composition.js';
import { HOST, serverConfig, speechSettings } from './config.js';

// Serves the API and, when `COMMS_WEB_DIST` names the built web app, the app itself, on
// 127.0.0.1 only. `tailscale serve` makes it reachable on the tailnet (see the README).
const main = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* serverConfig;
    const speech = speechSettings(config.speechUrl, config.speechModel);
    if (speech._tag === 'HalfSet') {
      yield* Effect.logWarning(
        'Voice messages stay off: set COMMS_SPEECH_URL and COMMS_SPEECH_MODEL together.',
      );
    }
    yield* Effect.logInfo('pocket-comms listens').pipe(
      Effect.annotateLogs({
        url: `http://${HOST}:${config.port}`,
        herdr: config.socketPath,
        gitea: config.giteaUrl,
        giteaToken: Option.isSome(config.giteaToken) ? 'set' : 'not set',
        brainstorm: Option.getOrElse(config.brainstormModel, () => 'not set up'),
        speech: speech._tag === 'On' ? speech.model : 'not set up',
        state: config.stateDir,
      }),
    );
    return Observability.serve(
      server({
        allowedLogin: config.allowedLogin,
        socketPath: config.socketPath,
        home: homedir(),
        projectsRoot: config.projectsRoot,
        agentArgs: config.agentArgs,
        gitea: { url: config.giteaUrl, token: config.giteaToken, hosts: config.giteaHosts },
        stateDir: config.stateDir,
        ...(speech._tag === 'On' ? { speech: { url: speech.url, model: speech.model } } : {}),
        ...Option.match(config.webDist, { onNone: () => ({}), onSome: (webDist) => ({ webDist }) }),
      }),
      { serviceName: 'comms-server' },
    ).pipe(Layer.provide(NodeHttpServer.layer(createServer, { port: config.port, host: HOST })));
  }),
);

Layer.launch(main).pipe(NodeRuntime.runMain);
