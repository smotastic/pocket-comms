import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type {
  AgentEventView,
  BrainstormEventView,
  BrainstormStateView,
  CommsClient,
  TranscriptView,
} from './comms-client.js';
import {
  activityKey,
  agentKey,
  brainstormKey,
  overviewKey,
  transcriptKey,
} from './comms-queries.js';

type EntriesEvent = Extract<AgentEventView, { readonly type: 'entries' }>;

/**
 * Applies an entries event to the transcript the cache holds: a reset replaces it, any other event
 * updates the entries with the same id in place and appends the new ones.
 */
export const mergeEntries = (
  held: TranscriptView | undefined,
  event: EntriesEvent,
): TranscriptView => {
  if (event.reset || held === undefined) {
    return { entries: event.entries, activity: event.activity };
  }
  const changed = new Map(event.entries.map((entry) => [entry.id, entry]));
  const kept = held.entries.map((entry) => changed.get(entry.id) ?? entry);
  const known = new Set(held.entries.map((entry) => entry.id));
  return {
    entries: [...kept, ...event.entries.filter((entry) => !known.has(entry.id))],
    activity: event.activity,
  };
};

/**
 * Follows the overview stream into the query cache while the screen is shown. `unavailable` holds
 * why Herdr cannot be reached, while it cannot.
 */
export const useOverviewLive = (client: CommsClient) => {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  const [unavailable, setUnavailable] = useState<string | undefined>(undefined);
  useEffect(
    () =>
      client.followOverview((state) => {
        if (state._tag === 'Unavailable') {
          setUnavailable(state.reason);
          return;
        }
        setUnavailable(undefined);
        queryClient.setQueryData(overviewKey, state.overview);
      }, setLive),
    [client, queryClient],
  );
  return { live, unavailable };
};

/** Follows the activity timeline's stream into the query cache while the page is shown. */
export const useActivityLive = (client: CommsClient) => {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  useEffect(
    () =>
      client.followActivity((activity) => queryClient.setQueryData(activityKey, activity), setLive),
    [client, queryClient],
  );
  return { live };
};

/** Follows one agent's stream into the query cache: the agent, and its conversation entries. */
export const useAgentLive = (client: CommsClient, ref: string) => {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  useEffect(
    () =>
      client.followAgent(
        ref,
        (event) => {
          if (event.type === 'agent') {
            queryClient.setQueryData(agentKey(ref), event.agent);
          } else {
            queryClient.setQueryData<TranscriptView>(transcriptKey(ref), (held) =>
              mergeEntries(held, event),
            );
          }
        },
        setLive,
      ),
    [client, queryClient, ref],
  );
  return { live };
};

/** Applies a brainstorm event: a state replaces the held one, a delta extends Pi's live text. */
export const applyBrainstormEvent = (
  held: BrainstormStateView | undefined,
  event: BrainstormEventView,
): BrainstormStateView | undefined => {
  if (event.type === 'state') return event.state;
  return held?._tag === 'Ready' ? { ...held, live: held.live + event.text } : held;
};

/** Follows the brainstorm stream into the query cache while `active`, such as while it is open. */
export const useBrainstormLive = (client: CommsClient, active: boolean) => {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    return client.followBrainstorm(
      (event) =>
        queryClient.setQueryData<BrainstormStateView>(brainstormKey, (held) =>
          applyBrainstormEvent(held, event),
        ),
      setLive,
    );
  }, [client, queryClient, active]);
  return { live };
};

/** The current time, renewed every `interval` milliseconds, for "4m ago" labels. */
export const useNow = (interval = 15_000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
};
