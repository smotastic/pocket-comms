import { queryOptions } from '@tanstack/react-query';
import { RequestError, type CommsClient, type PullRequestRef } from './comms-client.js';

// Query keys and options. The live streams write into the same keys (`live.ts`), so a screen
// reads one cache whether the data came from a request or an event.

export const overviewKey = ['overview'] as const;
export const agentKey = (ref: string) => ['agent', ref] as const;
export const conversationKey = (ref: string) => ['conversation', ref] as const;
export const screenKey = (ref: string) => ['screen', ref] as const;
export const subagentKey = (ref: string, id: string) => ['subagent', ref, id] as const;
export const planetsKey = ['planets'] as const;
export const issuesKey = (planet: string) => ['issues', planet] as const;
export const brainstormKey = ['brainstorm'] as const;
export const activityKey = ['activity'] as const;
/** The multiplexer the overview stream last named; only that stream writes it. */
export const multiplexerKey = ['multiplexer'] as const;
export const quickRepliesKey = ['quick-replies'] as const;
export const speechKey = ['speech'] as const;
export const pullRequestsKey = (ref: string) => ['pull-requests', ref] as const;
export const taskStartKey = (ref: string, fromIssue: boolean) =>
  ['task-start', ref, fromIssue] as const;
export const pullRequestChangesKey = (ref: string, { owner, name, number }: PullRequestRef) =>
  ['pull-request-changes', ref, owner, name, number] as const;

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

export const conversationQuery = (client: CommsClient, ref: string) =>
  queryOptions({ queryKey: conversationKey(ref), queryFn: () => client.conversation(ref) });

/** A subagent that does not exist will not appear on a second try, so a 404 is not retried. */
export const subagentQuery = (client: CommsClient, ref: string, id: string) =>
  queryOptions({
    queryKey: subagentKey(ref, id),
    queryFn: () => client.subagent(ref, id),
    retry: (failures, error) =>
      !(error instanceof RequestError && error.status === 404) && failures < 3,
  });

/** The screen is read again about once a second while it is shown (spec 004, requirement 10). */
export const screenQuery = (client: CommsClient, ref: string) =>
  queryOptions({
    queryKey: screenKey(ref),
    queryFn: () => client.screen(ref),
    refetchInterval: 1000,
  });

/** The planets are read again each time the New task sheet opens. */
/** The planets in their order; `otherRepositoriesQuery` shares the request. */
export const planetsQuery = (client: CommsClient) =>
  queryOptions({
    queryKey: planetsKey,
    queryFn: () => client.planets(),
    staleTime: 0,
    select: (data) => data.planets,
  });

export const preflightKey = (planet: string) => ['planets', planet, 'preflight'] as const;

/** A planet's preflight; the server reuses it for 60 seconds, so this asks no more often. */
export const preflightQuery = (client: CommsClient, planet: string) =>
  queryOptions({
    queryKey: preflightKey(planet),
    queryFn: () => client.preflight(planet),
    staleTime: 60_000,
    retry: false,
  });

/** The repositories below the root that are not planets, by name (spec 034). */
export const otherRepositoriesQuery = (client: CommsClient) =>
  queryOptions({
    queryKey: planetsKey,
    queryFn: () => client.planets(),
    staleTime: 0,
    select: (data) => data.others,
  });

/** A planet's issues, read again every 30 seconds so the agents working on them stay current. */
export const issuesQuery = (client: CommsClient, planet: string) =>
  queryOptions({
    queryKey: issuesKey(planet),
    queryFn: () => client.issues(planet),
    refetchInterval: 30_000,
  });

/** The brainstorm, read when its sheet opens; the stream keeps it current while open. */
export const brainstormQuery = (client: CommsClient) =>
  queryOptions({ queryKey: brainstormKey, queryFn: () => client.brainstorm(), staleTime: 0 });

/** The activity timeline; its stream keeps it current while the page is open. */
export const activityQuery = (client: CommsClient) =>
  queryOptions({ queryKey: activityKey, queryFn: () => client.activity() });

/** Whether the server transcribes; the setting changes only with a restart. */
export const speechQuery = (client: CommsClient) =>
  queryOptions({ queryKey: speechKey, queryFn: () => client.speech(), staleTime: Infinity });

/** The owner's quick replies; the Settings page writes the saved list into the cache. */
export const quickRepliesQuery = (client: CommsClient) =>
  queryOptions({ queryKey: quickRepliesKey, queryFn: () => client.quickReplies() });

/**
 * The agent's attached pull requests (spec 031): read when the conversation opens, every 30
 * seconds while it is open and when the app comes back to the foreground.
 */
export const pullRequestsQuery = (client: CommsClient, ref: string) =>
  queryOptions({
    queryKey: pullRequestsKey(ref),
    queryFn: () => client.pullRequests(ref),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

/** An attached pull request's changes, read when its sheet opens and on Refresh. */
export const pullRequestChangesQuery = (
  client: CommsClient,
  ref: string,
  pullRequest: PullRequestRef,
) =>
  queryOptions({
    queryKey: pullRequestChangesKey(ref, pullRequest),
    queryFn: () => client.pullRequestChanges(ref, pullRequest),
    staleTime: 0,
    retry: (failures, error) =>
      !(error instanceof RequestError && error.status === 404) && failures < 2,
  });

/**
 * The agent's task start (spec 032): read when the conversation opens and every 5 seconds while
 * one is shown, so Send follows the agent's readiness.
 */
export const taskStartQuery = (client: CommsClient, ref: string, fromIssue: boolean) =>
  queryOptions({
    queryKey: taskStartKey(ref, fromIssue),
    queryFn: async () => (await client.taskStart(ref, fromIssue)) ?? null,
    refetchInterval: (query) => (query.state.data === null ? false : 5_000),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
