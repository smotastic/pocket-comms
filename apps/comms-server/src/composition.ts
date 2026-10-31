import { commsServerLayer } from '@pocket-comms/comms-api';
import { AgentsInbound, HerdrOutbound, TasksInbound } from '@pocket-comms/comms-application';
import {
  Herdr,
  Projects,
  Seen,
  StatusHistory,
  Transcript,
} from '@pocket-comms/comms-infrastructure';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

// The composition root of the server: it wires the adapters. It holds no business logic.

export interface ServerOptions {
  readonly allowedLogin: string;
  readonly socketPath: string;
  /** The home folder that holds the agents' session files. */
  readonly home: string;
  /** The folder whose git repositories a task can start in (spec 005). */
  readonly projectsRoot: string;
  /** Extra arguments for every agent the app starts. */
  readonly agentArgs: ReadonlyArray<string>;
  readonly webDist?: string;
}

/**
 * The adapters: Herdr over its socket, session files below `home`, git below `projectsRoot`, and
 * memory for the rest.
 */
export const services = ({
  socketPath,
  home,
  projectsRoot,
  agentArgs,
}: Omit<ServerOptions, 'allowedLogin' | 'webDist'>) =>
  Layer.mergeAll(
    Herdr.layerSocket({ path: socketPath, agentArgs }),
    Projects.layerGit({ root: projectsRoot }),
    Transcript.layerFiles({ home }),
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
    Layer.provide([AgentsInbound.layer, TasksInbound.layer]),
    Layer.provideMerge(services(adapters)),
  );
