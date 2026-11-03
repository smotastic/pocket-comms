# Plan 019 — pocket-comms: show an agent's background work and its subagents

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved by the owner (2026-11-03)

## 1. Affected projects

| Path                            | Change                                                                                                                                          | Nx tags                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `background.ts`: background items, what still runs at a time; `needsYou` and `buildOverview` take the running count; `subagent` on tool entries | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `TranscriptOutbound.background`; a subagent `TranscriptSource`; background on `AgentDto`; the subagent use cases; `SubagentNotFoundError`       | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | The Claude parser tracks background work and reads subagent files; the files adapter keeps an incremental background read per session           | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `background` on `Agent`; `subagent` on the tool entry; two subagent endpoints                                                                   | `scope:contracts`                     |
| `packages/comms/api`            | The subagent handlers; 404 for an unknown subagent                                                                                              | `scope:comms`, `layer:api`            |
| `apps/comms-server`             | The OpenAPI document                                                                                                                            | `scope:comms`, `type:app`             |
| `packages/design/ui`            | `AgentRow`: a background marker; `BackgroundStrip`; `ToolLine`: a link and a hint; a `background` icon                                          | `scope:design`, `type:ui`             |
| `apps/comms-web`                | Row marker, the strip in `Conversation`, delegation links, the subagent route and `SubagentConversation`, its live stream                       | `scope:comms`, `type:web`             |

### Shapes

- **Domain** (`background.ts`).
  - `BackgroundKind = 'shell' | 'monitor' | 'subagent'`.
  - `BackgroundItem { id, kind, description, startedAt, inBackground, expiresAt?, subagent? }`.
    - `id` is the tool use id.
    - `inBackground` is false only for a foreground subagent.
    - `subagent` is the subagent's id, once known.
  - `runningAt(items, now)` drops monitors past `expiresAt` and sorts the rest oldest first.
  - `needsYou(agent, seen, running)`: blocked, or done with no running item and an unseen
    completion (requirement 5). `buildOverview` takes `runningOf: (agent) => number` and passes it
    through.
  - The tool entry gains `subagent?: string`. Claude's format stays out of the domain.
- **Parser** (`infrastructure/src/transcript/claude.ts`).
  - `TranscriptParser` gains `background(): ReadonlyArray<BackgroundItem>`, the items started and
    not yet ended in the lines pushed so far. Pi's parser returns none.
  - The Claude parser records a start on:
    - a `Bash` result with `toolUseResult.backgroundTaskId` (shell, keyed by the task id too);
    - a `Monitor` result reading "Monitor started (task <id>, expires in <n><s|m|h>". `expiresAt`
      is the result's time plus the duration; without one the monitor has no expiry.
    - an `Agent`/`Task` call. On its `tool_use` it is a foreground subagent.
      - If its result has `toolUseResult.isAsync`, it turns into a background one keyed by
        `agentId`.
      - Any other result ends it.
      - `run_in_background` is read as `true` or `"true"`.
  - It records an end on:
    - a user line with `origin.kind: "task-notification"` whose content names a `<task-id>` or
      `<tool-use-id>`. Ends are idempotent: Claude may notify more than once.
    - an `ok` result of `TaskStop` (`task_id`) or `KillShell` (`shell_id`).
  - `queue-operation` lines and `isSidechain` lines change nothing.
  - An `Agent` tool entry gets `subagent` from `toolUseResult.agentId`.
  - `createClaudeParser(cwd, { sidechain: true })` reads a subagent's own file. Its lines are
    sidechain lines, and its first user line is the parent's prompt to it.
- **Files adapter** (`files.ts`).
  - `TranscriptSource` gains `subagent?: string`. With it, `find` resolves
    `<session dir>/subagents/agent-<id>.jsonl`, and only an id matching `^[a-z0-9]{1,64}$`.
  - `background(source)` keeps one parser and a byte offset per session path. Each call reads only
    what was appended since the last one (requirement 3 without re-reading the file every 2 s), and
    drops the state of a path no call asked for in 10 minutes.
  - `subagentsOf(source)` reads the `subagents/*.meta.json` of the session. It maps `toolUseId` to
    `{ id, description, agentType }` and fills `subagent` on items and tool entries that lack it.
    A missing or unreadable meta file is skipped (spec note).
- **Use cases.**
  - `makeLoadAgents.load`:
    - asks `background(source)` for each Claude agent; a failed read counts as no background work;
    - applies `runningAt(…, now)`;
    - puts the items on `AgentDto.background`;
    - passes their count to `needsYou`.

    Herdr's `changes` already tick every 2 s, so the overview and the conversation pick up a start,
    an end or an expiry within one tick. A gone pane or a new session drops the items by itself:
    the agent or its source changes (requirement 2).

  - `SubagentsInbound`:
    - `subagent(ref, id) → SubagentDto`, which is
      `{ id, description, agentType, running, inBackground, entries, activity }`;
    - `subagentEvents(ref, id)`: a `subagent` event at once and on each change, plus `entries`
      events as for an agent. It ends when the parent is gone.

    An id that is not a subagent of the parent's current session fails with
    `SubagentNotFoundError`.

- **API.**
  - `GET /agents/:agent/subagents/:subagent` answers `Subagent`, or 404 when unknown.
  - `GET /agents/:agent/subagents/:subagent/events` streams `SubagentEvent` like `agentEvents`.
  - Both go through the identity guard.
- **Design.**
  - `AgentRow` gains `background?: { count: number; label: string }`. It shows the `background`
    icon and the count next to the dot, and the label joins the row's accessible name.
  - `BackgroundStrip { items: ReadonlyArray<{ kind, description, since, href? }> }`, built on
    `Disclosure`:
    - collapsed it reads "N running in the background";
    - each row shows the kind, the description and the running time;
    - a row with `href` is a link.
  - `ToolLine` gains `href?` (the line becomes a link) and `hint?` (muted text such as "running in
    the background").
- **Web.**
  - `AgentItem` passes the marker.
  - `Conversation`:
    - renders `BackgroundStrip` between the entries and the composer from `agent.background`,
      with the running time from `since.ts` on a 1-minute tick;
    - links a "Delegated" `ToolLine` with `subagent` to the subagent route, with the hint while
      the agent's background list holds it.
  - Route `/agents/$agent/subagents/$subagent` renders `SubagentConversation`:
    - the top bar shows the description, "Subagent of <agent>" and back to the parent;
    - the entries render as in `Conversation`, with no composer;
    - a 404 shows "This subagent was not found.";
    - a `useSubagentLive` hook writes the stream into its query key, as `live.ts` does for agents.

## 2. Contract changes

All additive within `/api/v1`:

- `Agent.background`: an array, empty when nothing runs;
- an optional `subagent` on the tool transcript entry;
- the `Subagent`, `SubagentEvent` and `SubagentParam` schemas, and the two endpoints above.

Old clients ignore the new fields.

## 3. Migrations

None. The service has no database; background state is read from the session files and kept in
server memory.

## 4. Test strategy

- **Domain:**
  - `runningAt` with expired and unexpired monitors, and its order;
  - `needsYou` for done with and without running work, and blocked with running work;
  - `buildOverview` keeps a done agent with background work in Everything else.
- **Infrastructure:**
  - The Claude parser with a new anonymised fixture `claude-background.jsonl`, shaped like the
    lines in the spec note:
    - a background shell and its notification;
    - a monitor with an expiry;
    - a background subagent with its async result and notification;
    - a foreground subagent ending with its result;
    - a `TaskStop`;
    - a duplicate notification;
    - `queue-operation` copies;
    - `run_in_background: "true"`.
  - The subagent parser with a fixture `subagents/agent-<id>.jsonl` and its `.meta.json`.
  - The files adapter in a temporary folder:
    - `background` sees a start written before the 300-entry window and an end appended later,
      reading only the new bytes;
    - `find` with a subagent id, and a refused id with `/` or `..`;
    - a missing meta file.
- **Application:** with the transcript and Herdr fakes:
  - `AgentDto.background` and `needsYou` for a done agent with running work;
  - a monitor that expires between two loads;
  - the subagent use cases (found, unknown, the parent gone ends the stream).
- **API:** `comms-api.spec.ts` covers the subagent read (200, 404, 403 without the login), the
  events stream, and `background` on the overview. The contract spec lists the paths.
- **Design:**
  - `AgentRow` with and without the marker, and its accessible name;
  - `BackgroundStrip` collapsed and expanded, and a link row;
  - `ToolLine` with `href` and `hint`;
  - stories for each.
- **Web:**
  - the row marker on the overview and the project page;
  - the strip appears, expands, links a subagent and not a shell, and goes when the list empties;
  - a delegation link;
  - the subagent page renders, has no composer, leads back, and shows the not-found text;
  - 390 px fit, checked by hand on the phone, as in spec 016.
- **Boundaries:** the existing layer tags and dependency-cruiser rules. Claude's line format stays
  in `infrastructure`. No new dependency.

## 5. Risks

- **Claude Code's file format is internal.** Task notifications, `backgroundTaskId`, the Monitor
  text and the meta files are undocumented and may change.
  - **If a start is missed,** no marker shows: today's behaviour.
  - **If an end is missed,** a marker stays until the pane closes or the session changes. A
    monitor's expiry bounds its own case.
  - The fixtures pin today's shapes (Claude Code 2.1.302).

  > **Seen in real sessions (2026-11-03).** The parser ran over all 126 local Claude sessions. In
  > every session older than an hour, nothing it started is still open. It took two fixes to get
  > there:
  >
  > - notices that arrive during a turn come as `attachment` lines, and the queue copy comes
  >   first, so every copy now ends a task;
  > - a monitor's event notices carry no `<status>` and no longer end it.
  >
  > 26 of 320 background shells had no `run_in_background` flag (Claude moved them itself), so a
  > shell counts by its `backgroundTaskId` alone.

- **Foreground subagents.** All 235 local meta files were `requestShape: "background"`.

  > **Seen with a foreground subagent (2026-11-03,** a headless Claude run in a scratch folder).
  > Its meta file says `requestShape: "foreground"` and holds the `toolUseId`. Its result carries
  > `agentId`, the call's `run_in_background` is `false`, and the parser read both files as
  > expected. The meta file has a `finished` flag, so it exists while the subagent runs.

- **A resumed subagent.** A subagent notifies each time it stops, and the owner's agent can resume
  it afterwards. A resumed subagent is not counted again until its next notice. This is accepted:
  it is rare and the parent shows its own activity meanwhile.

- **A resumed session.** If Claude is restarted into the same session file after a crash, items
  of the crashed run never get a notification. They stay until the pane closes or the session
  changes. The owner accepted this rule in the spec (requirement 2).
- **Cost per tick.**
  - Every 2 s, each Claude agent's session file is checked for appended bytes. That is one `stat`,
    plus a read only when it grew.
  - The meta folder is listed only while a subagent item or a "Delegated" entry lacks its id.
