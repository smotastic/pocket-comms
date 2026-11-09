import { NodeRuntime } from '@effect/platform-node';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { join } from 'node:path';
import { buddy } from './buddy.js';
import { buddyConfig } from './config.js';
import * as FfmpegRecorder from './ffmpeg-recorder.js';
import * as FileOutbox from './file-outbox.js';
import * as HttpComms from './http-comms.js';
import * as TerminalButton from './terminal-button.js';
import * as TerminalScreen from './terminal-screen.js';

// The buddy on the laptop: the keyboard is the button, `ffmpeg` the microphone, the terminal
// the screen. The clips wait in `$BUDDY_HOME/outbox`.

const main = Effect.gen(function* () {
  const config = yield* buddyConfig.pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(
          `The buddy needs BUDDY_COMMS_URL, the tailnet address of comms (https://<mac>.<tailnet>.ts.net).\n${String(error)}\n`,
        );
        process.exit(1);
      }),
    ),
  );
  yield* buddy.pipe(
    Effect.provide(
      Layer.mergeAll(
        TerminalButton.layer,
        FfmpegRecorder.layer(config.audioDevice),
        TerminalScreen.layer,
        FileOutbox.layer(join(config.home, 'outbox')),
        HttpComms.layer(config.commsUrl),
      ),
    ),
  );
  process.stdout.write('Bye. Clips not yet sent stay in the outbox.\n');
});

NodeRuntime.runMain(main, { disableErrorReporting: false });
