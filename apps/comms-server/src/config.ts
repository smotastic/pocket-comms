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
  // The brainstorm chat's model, for the start-up log; the agent package reads the
  // `COMMS_BRAINSTORM_*` settings itself (ADR 0014).
  brainstormModel: optionalString('COMMS_BRAINSTORM_MODEL'),
  // The speech-to-text service of voice messages; `speechSettings` combines the two.
  speechUrl: optionalString('COMMS_SPEECH_URL'),
  speechModel: optionalString('COMMS_SPEECH_MODEL'),
});

/**
 * Voice messages need both speech settings and an http URL; otherwise they stay off and the log
 * says why.
 */
export type SpeechSettings =
  | { readonly _tag: 'On'; readonly url: string; readonly model: string }
  | { readonly _tag: 'Off' }
  | { readonly _tag: 'HalfSet' }
  | { readonly _tag: 'BadUrl' };

const isHttpUrl = (url: string) => {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export const speechSettings = (
  url: Option.Option<string>,
  model: Option.Option<string>,
): SpeechSettings => {
  if (Option.isSome(url) && Option.isSome(model)) {
    if (!isHttpUrl(url.value)) return { _tag: 'BadUrl' };
    return { _tag: 'On', url: url.value, model: model.value };
  }
  return Option.isNone(url) && Option.isNone(model) ? { _tag: 'Off' } : { _tag: 'HalfSet' };
};
