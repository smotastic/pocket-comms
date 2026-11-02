import { Agent } from '@pocket-comms/comms-infrastructure';
import * as Config from 'effect/Config';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The server listens on the loopback interface only; `tailscale serve` is the one way in
 * (spec 004, requirement 19).
 */
export const HOST = '127.0.0.1';

/** An optional setting; an empty value counts as none. */
const optionalString = (name: string) =>
  Config.option(Config.String(name)).pipe(
    Config.map(Option.filter((value) => value.trim() !== '')),
  );

/** The server's settings, from the environment. */
export const serverConfig = Config.all({
  port: Config.Port('COMMS_PORT').pipe(Config.withDefault(4410)),
  allowedLogin: Config.String('COMMS_ALLOWED_LOGIN').pipe(Config.withDefault('smotastic@')),
  socketPath: Config.String('HERDR_SOCKET_PATH').pipe(
    Config.withDefault(join(homedir(), '.config', 'herdr', 'herdr.sock')),
  ),
  webDist: Config.option(Config.String('COMMS_WEB_DIST')),
  projectsRoot: Config.String('COMMS_PROJECTS_ROOT').pipe(
    Config.withDefault(join(homedir(), 'Development', 'projects')),
  ),
  // Split on whitespace only; the arguments never pass through a shell (spec 005, requirement 12).
  agentArgs: Config.String('COMMS_AGENT_ARGS').pipe(
    Config.withDefault(''),
    Config.map((args) => args.split(/\s+/u).filter((arg) => arg !== '')),
  ),
  giteaUrl: Config.String('COMMS_GITEA_URL').pipe(Config.withDefault('http://localhost:3000')),
  // A secret: it stays redacted, and an empty value counts as none (spec 006, requirement 2).
  giteaToken: Config.option(Config.Redacted('COMMS_GITEA_TOKEN')).pipe(
    Config.map(Option.filter((token) => Redacted.value(token).trim() !== '')),
  ),
  giteaHosts: Config.String('COMMS_GITEA_HOSTS').pipe(
    Config.withDefault('gitea'),
    Config.map((hosts) =>
      hosts
        .split(',')
        .map((host) => host.trim())
        .filter((host) => host !== ''),
    ),
  ),
  // The brainstorm chat's state (spec 013).
  stateDir: Config.String('COMMS_STATE_DIR').pipe(
    Config.withDefault(join(homedir(), '.pocket-comms')),
  ),
  // The brainstorm chat's model; without provider and model the chat says it is not set up.
  brainstormProvider: optionalString('COMMS_BRAINSTORM_PROVIDER'),
  brainstormModel: optionalString('COMMS_BRAINSTORM_MODEL'),
  // A secret, like the Gitea token.
  brainstormApiKey: Config.option(Config.Redacted('COMMS_BRAINSTORM_API_KEY')).pipe(
    Config.map(Option.filter((key) => Redacted.value(key).trim() !== '')),
  ),
  brainstormThinking: Config.Literals(Agent.THINKING_LEVELS, 'COMMS_BRAINSTORM_THINKING').pipe(
    Config.withDefault('off' as const),
  ),
  // Pi's credential file: `COMMS_PI_AUTH_FILE`, else `auth.json` in Pi's own directory setting.
  piAuthFile: Config.all({
    file: optionalString('COMMS_PI_AUTH_FILE'),
    agentDir: optionalString('PI_CODING_AGENT_DIR'),
  }).pipe(
    Config.map(({ file, agentDir }) =>
      Agent.piAuthFilePath({
        file: Option.getOrUndefined(file),
        agentDir: Option.getOrUndefined(agentDir),
      }),
    ),
  ),
});
