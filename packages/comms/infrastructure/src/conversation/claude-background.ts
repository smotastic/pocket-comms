import type { BackgroundItem } from '@pocket-comms/comms-domain';
import { isRecord, oneLine, stringField } from './entries.js';

// Claude Code reports background work in its own words: a result names the task it started, a
// later user line (`origin.kind: "task-notification"`) says it ended, and `TaskStop` or
// `KillShell` stop one by its task id. None of this is a documented format.

const TASK_TAG = /<task-id>([^<]+)<\/task-id>/u;
const TOOL_USE_TAG = /<tool-use-id>([^<]+)<\/tool-use-id>/u;
const STATUS_TAG = /<status>[^<]+<\/status>/u;
const MONITOR_TASK = /^Monitor started \(task ([^\s,)]+)/u;
const MONITOR_EXPIRY = /expires in (\d+)\s*([smh])\b/u;
const UNIT_MS = new Map([
  ['s', 1_000],
  ['m', 60_000],
  ['h', 3_600_000],
]);

// Claude writes the flag as a boolean for shells and as a string for subagents.
const runsInBackground = (input: unknown) => {
  const flag = isRecord(input) ? input['run_in_background'] : undefined;
  return flag === true || flag === 'true';
};

// The ids the API accepts for a subagent; another value names no subagent the app can open.
const SUBAGENT_ID = /^[a-z0-9]{1,64}$/u;

/** The subagent a delegation's result names, when its id is one the app can address. */
export const subagentOf = (details: unknown): string | undefined => {
  const id = stringField(details, 'agentId');
  return id !== undefined && SUBAGENT_ID.test(id) ? id : undefined;
};

const descriptionOf = (input: unknown) =>
  stringField(input, 'description') ?? oneLine(stringField(input, 'command') ?? '');

interface Call {
  readonly name: string;
  readonly input: unknown;
  readonly at: number;
}

/** Follows the background work of one session, line by line, in file order. */
export const backgroundLog = () => {
  const calls = new Map<string, Call>();
  const running = new Map<string, BackgroundItem>();
  // Claude names a running task by its own id; the item is kept by the call that started it.
  const callOfTask = new Map<string, string>();

  const start = (item: BackgroundItem, task: string) => {
    running.set(item.id, item);
    callOfTask.set(task, item.id);
  };

  const endCall = (id: string) => {
    running.delete(id);
    for (const [task, call] of callOfTask) if (call === id) callOfTask.delete(task);
  };

  const end = (task: string) => {
    const id = callOfTask.get(task);
    if (id !== undefined) endCall(id);
  };

  return {
    items: (): ReadonlyArray<BackgroundItem> => [...running.values()],

    /** A tool call the assistant made. A subagent runs from here; other work from its result. */
    call: (id: string, name: string, input: unknown, at: number) => {
      calls.set(id, { name, input, at });
      if (name === 'Agent' || name === 'Task') {
        running.set(id, {
          id,
          kind: 'subagent',
          description: descriptionOf(input),
          startedAt: at,
          inBackground: runsInBackground(input),
        });
      }
    },

    /** The result of a tool call: `text` is its content, `details` Claude's `toolUseResult`. */
    result: (id: string, ok: boolean, text: string, details: unknown, at: number) => {
      const call = calls.get(id);
      if (call === undefined) return;
      calls.delete(id);
      const description = descriptionOf(call.input);
      const base = { id, description, startedAt: call.at, inBackground: true };
      switch (call.name) {
        case 'Bash': {
          const task = stringField(details, 'backgroundTaskId');
          // Claude also moves a long command into the background by itself, without the flag.
          if (ok && task !== undefined) {
            start({ ...base, kind: 'shell' }, task);
          }
          return;
        }
        case 'Monitor': {
          const task = MONITOR_TASK.exec(text)?.[1];
          if (!ok || task === undefined) return;
          const expiry = MONITOR_EXPIRY.exec(text);
          const unit = UNIT_MS.get(expiry?.[2] ?? '');
          const expiresAt =
            expiry === null || unit === undefined ? undefined : at + Number(expiry[1]) * unit;
          start(
            { ...base, kind: 'monitor', ...(expiresAt === undefined ? {} : { expiresAt }) },
            task,
          );
          return;
        }
        case 'Agent':
        case 'Task': {
          const subagent = subagentOf(details);
          const item = running.get(id);
          if (ok && item !== undefined && isRecord(details) && details['isAsync'] === true) {
            start(
              { ...item, inBackground: true, ...(subagent === undefined ? {} : { subagent }) },
              subagent ?? id,
            );
          } else {
            endCall(id);
          }
          return;
        }
        case 'TaskStop':
          if (ok) end(stringField(call.input, 'task_id') ?? '');
          return;
        case 'KillShell':
          if (ok) end(stringField(call.input, 'shell_id') ?? '');
          return;
      }
    },

    /**
     * A task's notification, naming it by its call or by its task id. Only one with a status says
     * the task ended; a monitor also notifies on each event it sees, without one.
     */
    notification: (text: string) => {
      if (!STATUS_TAG.test(text)) return;
      const call = TOOL_USE_TAG.exec(text)?.[1];
      if (call !== undefined && running.has(call)) {
        endCall(call);
        return;
      }
      end(TASK_TAG.exec(text)?.[1] ?? '');
    },
  };
};
