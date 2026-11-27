import { commsServerLayer } from '@pocket-comms/comms-api';
import {
  ActivityInbound,
  AgentsInbound,
  BrainstormInbound,
  MultiplexerOutbound,
  ImagesInbound,
  IssuesInbound,
  PullRequestsInbound,
  TaskStartsInbound,
  PushInbound,
  makePlanetRegistry,
  MissionsInbound,
  PlanetsInbound,
  QuickRepliesInbound,
  SpeechInbound,
  TasksInbound,
} from '@pocket-comms/comms-application';
import {
  Activity,
  Brainstorm,
  Gitea,
  Hc,
  Herdr,
  Images,
  MissionBot,
  Deploy,
  Missions,
  Planets,
  Repositories,
  PullRequests,
  TaskStarts,
  Push,
  QuickReplies,
  Seen,
  StatusHistory,
  Conversation,
} from '@pocket-comms/comms-infrastructure';
import { layerPiRuntime } from '@smotastic/pocket-agent/pi';
import {
  layerOpenAiTranscriber,
  layerTranscriberNotSetUp,
  type OpenAiTranscriberOptions,
} from '@smotastic/pocket-agent/speech';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import type * as Redacted from 'effect/Redacted';
import { join } from 'node:path';

// The composition root of the server: it wires the adapters. It holds no business logic.

/**
 * Who runs the server, as every push names it. Push services take only an `https:` or `mailto:`
 * address, and Apple refuses a made-up one.
 */
const PUSH_SUBJECT = 'https://github.com/smotastic/pocket-comms';

/** How requests name this app to the brainstorm's model provider. */
const ATTRIBUTION = { name: 'pocket-comms', url: 'https://github.com/smotastic/pocket-comms' };

export interface ServerOptions {
  readonly allowedLogin: string;
  /** The program that runs the agents (ADR 0015, spec 033). */
  readonly multiplexer: 'herdr' | 'hc';
  /** Herdr's socket. */
  readonly socketPath: string;
  /** hc's socket. */
  readonly hcSocketPath: string;
  /** The home folder that holds the agents' session files. */
  readonly home: string;
  /** The folder whose git repositories a task can start in (spec 005). */
  readonly repositoriesRoot: string;
  /** The folder that holds the new tasks' worktrees, one folder per planet (ADR 0015). */
  readonly worktreesRoot: string;
  /** Extra arguments for every agent the app starts. */
  readonly agentArgs: ReadonlyArray<string>;
  /** The Gitea server whose issues the app reads (spec 006). */
  readonly gitea: Gitea.HttpOptions;
  /** The mission bot's token on that Gitea; none leaves missions off (spec 035). */
  readonly missionToken: Option.Option<Redacted.Redacted<string>>;
  /** The Claude settings of a mission's agent: auto mode and the deny list (ADR 0019). */
  readonly missionSettings: string;
  /** pocket-cloud's deploy script; none leaves deploys off (spec 036). */
  readonly deployScript?: Option.Option<string>;
  /**
   * The folder of the server's stored state: the brainstorm (spec 013), images (spec 014),
   * the activity timeline (spec 017), push devices (spec 018), quick replies (spec 025) and the attached pull requests (spec 031).
   */
  readonly stateDir: string;
  /** The speech-to-text service of voice messages; none leaves them off. */
  readonly speech?: OpenAiTranscriberOptions;
  readonly webDist?: string;
}

/**
 * The adapters: Herdr or hc over its socket, session files below `home`, git below `repositoriesRoot`,
 * Gitea over HTTP, Pi in process with the `COMMS_BRAINSTORM_*` settings (spec 013, ADR 0014), the brainstorm, the images, the activity timeline, the
 * push devices and the quick replies in `stateDir`, Web Push to the devices, the speech service of
 * voice messages when set up, and memory for the rest.
 */
export const services = ({
  multiplexer,
  socketPath,
  hcSocketPath,
  home,
  repositoriesRoot,
  worktreesRoot,
  agentArgs,
  gitea,
  missionToken,
  deployScript,
  missionSettings,
  stateDir,
  speech,
}: Omit<ServerOptions, 'allowedLogin' | 'webDist'>) =>
  Layer.mergeAll(
    multiplexer === 'hc'
      ? Hc.layerSocket({ path: hcSocketPath, agentArgs })
      : Herdr.layerSocket({ path: socketPath, agentArgs }),
    Repositories.layerGit({ root: repositoriesRoot, worktreesRoot }),
    Gitea.layerHttp(gitea),
    // The Claude hook (`claude-hook.ts`) keeps the waiting questions in the same state folder.
    Conversation.layerFiles({ home, questions: join(stateDir, 'questions') }),
    // Optional: without a model the server starts and the brainstorm says what is missing.
    layerPiRuntime({ prefix: 'COMMS_BRAINSTORM', required: false, attribution: ATTRIBUTION }),
    Brainstorm.layerFile({ folder: stateDir }),
    Images.layerFolder({ stateDir }),
    Push.layer({ stateDir, subject: PUSH_SUBJECT }),
    Activity.layerFile({ folder: stateDir }),
    QuickReplies.layerFile({ folder: stateDir }),
    PullRequests.layerFile({ folder: stateDir }),
    TaskStarts.layerFile({ folder: stateDir }),
    Planets.layerFile({ folder: stateDir }),
    Missions.layerFile({ folder: stateDir }),
    MissionBot.layer({
      url: gitea.url,
      token: missionToken,
      stateDir,
      settingsPath: missionSettings,
    }),
    Deploy.layer({ script: deployScript ?? Option.none(), stateDir }),
    speech === undefined ? layerTranscriberNotSetUp : layerOpenAiTranscriber(speech),
    Seen.layerMemory,
    StatusHistory.layerMemory,
  );

/** Ready while the multiplexer answers. */
export const herdrReadiness = MultiplexerOutbound.use(
  (herdrOutbound) => herdrOutbound.snapshot,
).pipe(Effect.asVoid);

/** Registers the planets once, when the server starts without a registry (spec 034). */
const seedPlanetsLayer = Layer.effectDiscard(
  makePlanetRegistry.pipe(
    Effect.flatMap((registry) => registry.seed),
    Effect.catchTag('PlanetsStoreError', (error) =>
      Effect.logError('The planets were not seeded').pipe(
        Effect.annotateLogs({ reason: error.reason }),
      ),
    ),
  ),
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
      PullRequestsInbound.layer,
      TaskStartsInbound.layer,
      PlanetsInbound.layer,
      MissionsInbound.layer,
      seedPlanetsLayer,
    ]),
    Layer.provideMerge(services(adapters)),
  );
