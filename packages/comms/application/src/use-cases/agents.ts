import {
  agentRef,
  needsYou,
  transcriptFormatOf,
  type Agent,
  type Workspace,
} from '@pocket-comms/comms-domain';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { AgentDto } from '../dto/agent.dto.js';
import { AgentNotFoundError } from '../errors.js';
import { HerdrOutbound } from '../ports/herdr.outbound.port.js';
import { SeenOutbound, StatusHistoryOutbound } from '../ports/memory.outbound.port.js';
import { TranscriptOutbound, type TranscriptSource } from '../ports/transcript.outbound.port.js';

// Shared by the use cases: reads Herdr once and turns each agent into what the app shows.

/** The session file of an agent, when the app can render it as a chat. */
export const sourceOf = (agent: Agent): Option.Option<TranscriptSource> => {
  const format = transcriptFormatOf(agent);
  if (format === undefined || agent.session === undefined) return Option.none();
  return Option.some({ ref: agentRef(agent), format, session: agent.session, cwd: agent.cwd });
};

/** A live agent with what the app shows for it. */
export interface AgentView {
  readonly agent: Agent;
  /** The agent's Herdr workspace, when Herdr lists it. */
  readonly workspace: Workspace | undefined;
  readonly dto: AgentDto;
}

export const makeLoadAgents = Effect.gen(function* () {
  const herdrOutbound = yield* HerdrOutbound;
  const transcriptOutbound = yield* TranscriptOutbound;
  const seenOutbound = yield* SeenOutbound;
  const statusHistoryOutbound = yield* StatusHistoryOutbound;

  // The last change is the newer of the session file's change and the last status change the
  // server saw. An agent seen for the first time counts from its session file, when it has one.
  const changedAt = Effect.fnUntraced(function* (agent: Agent) {
    const modified = yield* Option.match(sourceOf(agent), {
      onNone: () => Effect.succeed(Option.none<number>()),
      onSome: transcriptOutbound.modifiedAt,
    });
    const now = yield* Clock.currentTimeMillis;
    const mark = yield* statusHistoryOutbound.get(agent.paneId);
    if (Option.isNone(mark)) {
      const since = Option.getOrElse(modified, () => now);
      yield* statusHistoryOutbound.set(agent.paneId, { status: agent.status, since });
      return since;
    }
    const since = mark.value.status === agent.status ? mark.value.since : now;
    if (since !== mark.value.since) {
      yield* statusHistoryOutbound.set(agent.paneId, { status: agent.status, since });
    }
    return Math.max(
      since,
      Option.getOrElse(modified, () => 0),
    );
  });

  const load = Effect.fn('AgentsInbound.loadAgents')(function* () {
    const snapshot = yield* herdrOutbound.snapshot;
    const seen = yield* seenOutbound.seen;
    const workspaces = new Map(snapshot.workspaces.map((workspace) => [workspace.id, workspace]));
    const views = yield* Effect.forEach(snapshot.agents, (agent) =>
      Effect.map(changedAt(agent), (at): AgentView => {
        const workspace = workspaces.get(agent.workspaceId);
        return {
          agent,
          workspace,
          dto: {
            ref: agentRef(agent),
            paneId: agent.paneId,
            name: agent.name,
            kind: agent.kind,
            format: transcriptFormatOf(agent),
            status: agent.status,
            title: agent.title,
            cwd: agent.cwd,
            workspace: workspace?.label ?? agent.workspaceId,
            project: workspace?.project,
            worktree: workspace?.worktree,
            changedAt: at,
            needsYou: needsYou(agent, seen, 0),
          },
        };
      }),
    );
    return {
      views,
      workspaces: snapshot.workspaces satisfies ReadonlyArray<Workspace>,
      seen,
    };
  });

  /** The live agent that `ref` names: its Herdr name, or its pane id. */
  const find = Effect.fn('AgentsInbound.findAgent')(function* (ref: string) {
    const { views } = yield* load();
    const view =
      views.find((candidate) => candidate.agent.name === ref) ??
      views.find((candidate) => candidate.agent.paneId === ref);
    if (view === undefined) return yield* new AgentNotFoundError({ ref });
    return view;
  });

  return { load, find };
});
