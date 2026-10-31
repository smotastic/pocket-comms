import * as Config from 'effect/Config';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The server listens on the loopback interface only; `tailscale serve` is the one way in
 * (spec 004, requirement 19).
 */
export const HOST = '127.0.0.1';

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
});
