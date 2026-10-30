import { queryOptions } from '@tanstack/react-query';
import type { CommsClient } from './comms-client.js';

// Query keys and options. The live streams write into the same keys (`live.ts`), so a screen
// reads one cache whether the data came from a request or an event.

export const overviewKey = ['overview'] as const;
export const agentKey = (ref: string) => ['agent', ref] as const;
export const transcriptKey = (ref: string) => ['transcript', ref] as const;
export const screenKey = (ref: string) => ['screen', ref] as const;

export const overviewQuery = (client: CommsClient) =>
  queryOptions({ queryKey: overviewKey, queryFn: () => client.overview() });

export const agentQuery = (client: CommsClient, ref: string) =>
  queryOptions({ queryKey: agentKey(ref), queryFn: () => client.agent(ref) });

export const transcriptQuery = (client: CommsClient, ref: string) =>
  queryOptions({ queryKey: transcriptKey(ref), queryFn: () => client.transcript(ref) });

/** The screen is read again about once a second while it is shown (spec 004, requirement 10). */
export const screenQuery = (client: CommsClient, ref: string) =>
  queryOptions({
    queryKey: screenKey(ref),
    queryFn: () => client.screen(ref),
    refetchInterval: 1000,
  });
