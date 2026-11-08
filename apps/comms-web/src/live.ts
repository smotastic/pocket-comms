import { emptyChat, foldChat, type ChatView } from '@smotastic/pocket-agent/chat';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type {
  AgentEventView,
  BrainstormEntryView,
  BrainstormEventView,
  CommsClient,
  SubagentView,
  TranscriptView,
} from './comms-client.js';
import {
  activityKey,
  agentKey,
  brainstormKey,
  overviewKey,
  subagentKey,
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

/**
 * Follows a subagent's stream into the query cache while `active`: what it is, and its entries.
 * Entries that arrive before the first read are not lost: the subagent is read again.
 */
export const useSubagentLive = (client: CommsClient, ref: string, id: string, active: boolean) => {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const key = subagentKey(ref, id);
    return client.followSubagent(
      ref,
      id,
      (event) => {
        const held = queryClient.getQueryData<SubagentView>(key);
        if (held === undefined) {
          if (event.type === 'entries') void queryClient.invalidateQueries({ queryKey: key });
          return;
        }
        queryClient.setQueryData<SubagentView>(
          key,
          event.type === 'subagent'
            ? { ...held, ...event.subagent }
            : { ...held, ...mergeEntries(held, event) },
        );
      },
      setLive,
    );
  }, [client, queryClient, ref, id, active]);
  return { live };
};

/** The brainstorm chat as the sheet shows it: its items, Pi's draft, and whether Pi works. */
export type BrainstormView = ChatView<BrainstormEntryView>;

export const emptyBrainstorm: BrainstormView = emptyChat;

/**
 * Folds a brainstorm event into the view with the agent package's fold (spec 026). A New chat
 * drops everything before it; the view keeps only where to follow on from.
 */
export const foldBrainstorm = (
  view: BrainstormView,
  event: BrainstormEventView,
): BrainstormView => {
  const next = foldChat(view, event);
  return next !== view && event.kind === 'entry' && event.entry.kind === 'chatStarted'
    ? { ...emptyBrainstorm, after: next.after }
    : next;
};

// The entries after which the chat's state may have changed: Pi started or ended a turn, a
// message brought pictures, or a proposal changed.
const CHANGES_STATE: ReadonlySet<string> = new Set([
  'said',
  'proposal',
  'turnEnded',
  'turnFailed',
  'turnStopped',
  'chatStarted',
]);

/**
 * Follows the brainstorm stream while `active`, such as while the sheet is open, into a view that
 * outlives a close: opened again, it follows on after its last entry. The state is read again when
 * the stream says it may have changed, and after every (re)connect.
 */
export const useBrainstormLive = (client: CommsClient, active: boolean) => {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  const [view, setView] = useState(emptyBrainstorm);
  const after = useRef(view.after);
  after.current = view.after;
  useEffect(() => {
    if (!active) return undefined;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: brainstormKey });
    return client.followBrainstorm(
      () => after.current,
      (event) => {
        setView((held) => {
          const next = foldBrainstorm(held, event);
          after.current = next.after;
          return next;
        });
        if (event.kind === 'entry' && CHANGES_STATE.has(event.entry.kind)) refresh();
      },
      (connected) => {
        setLive(connected);
        if (connected) refresh();
      },
    );
  }, [client, queryClient, active]);
  return { view, live };
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
