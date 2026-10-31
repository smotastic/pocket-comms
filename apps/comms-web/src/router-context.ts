import type { CommsClient } from './comms-client.js';

/** What every route can reach: the typed client of the comms API. */
export interface RouterContext {
  readonly client: CommsClient;
}
