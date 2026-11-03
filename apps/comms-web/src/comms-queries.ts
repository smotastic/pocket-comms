import { queryOptions } from '@tanstack/react-query';
import { RequestError, type CommsClient } from './comms-client.js';

// Query keys and options. The live streams write into the same keys (`live.ts`), so a screen
// reads one cache whether the data came from a request or an event.

export const overviewKey = ['overview'] as const;
export const agentKey = (ref: string) => ['agent', ref] as const;
export const transcriptKey = (ref: string) => ['transcript', ref] as const;
export const screenKey = (ref: string) => ['screen', ref] as const;
export const projectsKey = ['projects'] as const;
export const issuesKey = (project: string) => ['issues', project] as const;
export const brainstormKey = ['brainstorm'] as const;
export const activityKey = ['activity'] as const;

export const overviewQuery = (client: CommsClient) =>
  queryOptions({ queryKey: overviewKey, queryFn: () => client.overview() });

/** An agent that is gone is not asked for again, so its screen says so at once. */
export const agentQuery = (client: CommsClient, ref: string) =>
  queryOptions({
    queryKey: agentKey(ref),
    queryFn: () => client.agent(ref),
    retry: (failures, error) =>
      !(error instanceof RequestError && error.status === 404) && failures < 3,
  });

export const transcriptQuery = (client: CommsClient, ref: string) =>
  queryOptions({ queryKey: transcriptKey(ref), queryFn: () => client.transcript(ref) });

/** The screen is read again about once a second while it is shown (spec 004, requirement 10). */
export const screenQuery = (client: CommsClient, ref: string) =>
  queryOptions({
    queryKey: screenKey(ref),
    queryFn: () => client.screen(ref),
    refetchInterval: 1000,
  });

/** The projects are read again each time the New task sheet opens. */
export const projectsQuery = (client: CommsClient) =>
  queryOptions({ queryKey: projectsKey, queryFn: () => client.projects(), staleTime: 0 });

/** A project's issues, read again every 30 seconds so the agents working on them stay current. */
export const issuesQuery = (client: CommsClient, project: string) =>
  queryOptions({
    queryKey: issuesKey(project),
    queryFn: () => client.issues(project),
    refetchInterval: 30_000,
  });

/** The brainstorm chat, read when its sheet opens; the stream keeps it current while open. */
export const brainstormQuery = (client: CommsClient) =>
  queryOptions({ queryKey: brainstormKey, queryFn: () => client.brainstorm(), staleTime: 0 });

/** The activity timeline; its stream keeps it current while the page is open. */
export const activityQuery = (client: CommsClient) =>
  queryOptions({ queryKey: activityKey, queryFn: () => client.activity() });
