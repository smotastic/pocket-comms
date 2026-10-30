import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { configure, render } from '@testing-library/react';
import {
  RequestError,
  type AgentEventView,
  type AgentView,
  type CommsClient,
  type Key,
  type OverviewStateView,
  type OverviewView,
  type TranscriptView,
} from './comms-client.js';
import { createAppRouter } from './router.js';

// The kit loads its Markdown renderer lazily; on a cold CI runner that first import alone can take
// longer than the default one second a `findBy` waits.
configure({ asyncUtilTimeout: 5_000 });

/** An agent with plain defaults: an idle Claude agent named kirk, changed a minute ago. */
export const fakeAgent = (overrides: Partial<AgentView> = {}): AgentView => ({
  ref: 'kirk',
  paneId: 'w1:p1',
  name: 'kirk',
  kind: 'claude',
  format: 'claude',
  status: 'idle',
  title: 'Fix the build',
  cwd: '/work/app',
  workspace: 'app',
  changedAt: Date.now() - 60_000,
  needsYou: false,
  ...overrides,
});

export interface FakeState {
  overview: OverviewView;
  readonly agents: Map<string, AgentView>;
  readonly transcripts: Map<string, TranscriptView>;
  readonly screens: Map<string, string>;
  /** A failure for the next prompt, as the server would report it. */
  promptFailure?: string;
}

/**
 * A stand-in for the API that records every command. `emitOverview` and `emitAgent` push live
 * events to the screens that follow them.
 */
export const fakeClient = (initial: Partial<FakeState> = {}) => {
  const state: FakeState = {
    overview: { needsYou: [], groups: [] },
    agents: new Map(),
    transcripts: new Map(),
    screens: new Map(),
    ...initial,
  };
  const calls = {
    prompts: [] as Array<[string, string]>,
    keys: [] as Array<[string, ReadonlyArray<Key>]>,
    seen: [] as Array<string>,
  };
  const overviewFollowers = new Set<(state: OverviewStateView) => void>();
  const agentFollowers = new Map<string, Set<(event: AgentEventView) => void>>();

  const find = (ref: string) => {
    const agent = state.agents.get(ref);
    if (agent === undefined) throw new RequestError(`No live agent is named ${ref}.`, 404);
    return agent;
  };

  const client: CommsClient = {
    overview: async () => state.overview,
    agent: async (ref) => find(ref),
    transcript: async (ref) => state.transcripts.get(ref) ?? { entries: [], activity: 'Thinking…' },
    screen: async (ref) => state.screens.get(ref) ?? '',
    prompt: async (ref, text) => {
      if (state.promptFailure !== undefined) throw new RequestError(state.promptFailure, 409);
      calls.prompts.push([ref, text]);
    },
    keys: async (ref, keys) => {
      calls.keys.push([ref, keys]);
    },
    seen: async (ref) => {
      calls.seen.push(ref);
    },
    followOverview: (onState, onLive) => {
      overviewFollowers.add(onState);
      onLive(true);
      return () => overviewFollowers.delete(onState);
    },
    followAgent: (ref, onEvent, onLive) => {
      const followers = agentFollowers.get(ref) ?? new Set();
      followers.add(onEvent);
      agentFollowers.set(ref, followers);
      onLive(true);
      return () => followers.delete(onEvent);
    },
  };

  return {
    client,
    state,
    calls,
    emitOverview: (next: OverviewStateView) => overviewFollowers.forEach((follow) => follow(next)),
    emitAgent: (ref: string, event: AgentEventView) =>
      agentFollowers.get(ref)?.forEach((follow) => follow(event)),
  };
};

/**
 * Renders the whole app at `path` with `client`, through the router and a fresh query cache that
 * does not retry, so a failed request shows at once.
 */
export const renderApp = ({
  client,
  path = '/',
}: {
  readonly client: CommsClient;
  readonly path?: string;
}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter({
    client,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
};
