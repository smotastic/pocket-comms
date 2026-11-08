import { commsServerLayer } from '@pocket-comms/comms-api';
import {
  ActivityInbound,
  AgentsInbound,
  BrainstormInbound,
  HerdrOutbound,
  ImagesInbound,
  IssuesInbound,
  PushInbound,
  QuickRepliesInbound,
  SpeechInbound,
  TasksInbound,
} from '@pocket-comms/comms-application';
import {
  Activity,
  Brainstorm,
  Gitea,
  Herdr,
  Images,
  Projects,
  Push,
  QuickReplies,
  Seen,
  Speech,
  StatusHistory,
  Transcript,
} from '@pocket-comms/comms-infrastructure';
import { layerPiRuntime } from '@smotastic/pocket-agent/pi';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

// The composition root of the server: it wires the adapters. It holds no business logic.

/**
 * Who runs the server, as every push names it. Push services take only an `https:` or `mailto:`
 * address, and Apple refuses a made-up one.
 */
const PUSH_SUBJECT = 'https://github.com/smotastic/pocket-comms';

/** How requests name this app to the brainstorm chat's model provider. */
const ATTRIBUTION = { name: 'pocket-comms', url: 'https://github.com/smotastic/pocket-comms' };

export interface ServerOptions {
  readonly allowedLogin: string;
  readonly socketPath: string;
  /** The home folder that holds the agents' session files. */
  readonly home: string;
  /** The folder whose git repositories a task can start in (spec 005). */
  readonly projectsRoot: string;
  /** Extra arguments for every agent the app starts. */
  readonly agentArgs: ReadonlyArray<string>;
  /** The Gitea server whose issues the app reads (spec 006). */
  readonly gitea: Gitea.HttpOptions;
  /**
   * The folder of the server's stored state: the brainstorm chat (spec 013), images (spec 014),
   * the activity timeline (spec 017), push devices (spec 018) and quick replies (spec 025).
   */
  readonly stateDir: string;
  /** The speech-to-text service of voice messages; none leaves them off. */
  readonly speech?: Speech.OpenAiOptions;
  readonly webDist?: string;
}

/**
 * The adapters: Herdr over its socket, session files below `home`, git below `projectsRoot`,
 * Gitea over HTTP, Pi in process with the `COMMS_BRAINSTORM_*` settings (spec 013, ADR 0014), the brainstorm chat, the images, the activity timeline, the
 * push devices and the quick replies in `stateDir`, Web Push to the devices, the speech service of
 * voice messages when set up, and memory for the rest.
 */
export const services = ({
  socketPath,
  home,
  projectsRoot,
  agentArgs,
  gitea,
  stateDir,
  speech,
}: Omit<ServerOptions, 'allowedLogin' | 'webDist'>) =>
  Layer.mergeAll(
    Herdr.layerSocket({ path: socketPath, agentArgs }),
    Projects.layerGit({ root: projectsRoot }),
    Gitea.layerHttp(gitea),
    Transcript.layerFiles({ home }),
    // Optional: without a model the server starts and the chat says what is missing.
    layerPiRuntime({ prefix: 'COMMS_BRAINSTORM', required: false, attribution: ATTRIBUTION }),
    Brainstorm.layerFile({ folder: stateDir }),
    Images.layerFolder({ stateDir }),
    Push.layer({ stateDir, subject: PUSH_SUBJECT }),
    Activity.layerFile({ folder: stateDir }),
    QuickReplies.layerFile({ folder: stateDir }),
    speech === undefined ? Speech.layerNotSetUp : Speech.layerOpenAi(speech),
    Seen.layerMemory,
    StatusHistory.layerMemory,
  );

/** Ready while Herdr answers. */
export const herdrReadiness = HerdrOutbound.use((herdrOutbound) => herdrOutbound.snapshot).pipe(
  Effect.asVoid,
);

/** Every route of the server, with the use cases on the adapters. */
export const server = ({ allowedLogin, webDist, ...adapters }: ServerOptions) =>
  commsServerLayer({
    allowedLogin,
    readiness: herdrReadiness,
    ...(webDist === undefined ? {} : { webDist }),
  }).pipe(
    Layer.provide([
      AgentsInbound.layer,
      TasksInbound.layer,
      IssuesInbound.layer,
      BrainstormInbound.layer,
      ImagesInbound.layer,
      PushInbound.layer,
      ActivityInbound.layer,
      QuickRepliesInbound.layer,
      SpeechInbound.layer,
    ]),
    Layer.provideMerge(services(adapters)),
  );
