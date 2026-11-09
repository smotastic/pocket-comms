import * as Config from 'effect/Config';
import * as Schema from 'effect/Schema';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The buddy's settings, from the environment. */
export const buddyConfig = Config.all({
  // The owner's tailnet address of comms; comms trusts the login `tailscale serve` adds to it.
  commsUrl: Config.schema(
    Schema.String.check(Schema.isPattern(/^https?:\/\/[^/]/u)),
    'BUDDY_COMMS_URL',
  ).pipe(Config.map((url) => url.replace(/\/+$/u, ''))),
  home: Config.String('BUDDY_HOME').pipe(Config.withDefault(join(homedir(), '.pocket-buddy'))),
  audioDevice: Config.String('BUDDY_AUDIO_DEVICE').pipe(Config.withDefault('0')),
});

export type BuddyConfig = Config.Success<typeof buddyConfig>;
