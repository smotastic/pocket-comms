/**
 * What the server's Claude hook (`claude-hook.ts`) does with one event: it keeps the waiting
 * `AskUserQuestion` call of a session in `<state>/questions/<session>.json` from `PreToolUse`,
 * and forgets it once no question can wait any more: after the answer (`PostToolUse`), at the
 * end of a turn (`Stop`), at a new prompt (`UserPromptSubmit`) and when a session starts or
 * resumes (`SessionStart`). Node built-ins only, so it runs from the built release alone.
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SESSION = /^[A-Za-z0-9-]{1,128}$/u;
const FORGETTING = new Set(['Stop', 'UserPromptSubmit', 'SessionStart']);

const stringOf = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

/** Where the server keeps the waiting calls, as its `COMMS_STATE_DIR` setting says. */
export const questionsFolder = (
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string => {
  const state = env['COMMS_STATE_DIR'];
  return join(
    state === undefined || state === '' ? join(home, '.pocket-comms') : state,
    'questions',
  );
};

/** Keeps or forgets the waiting call of the session the hook input names. */
export const handleHook = (input: string, folder: string): void => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return;
  }
  if (typeof parsed !== 'object' || parsed === null) return;
  const record = parsed as Record<string, unknown>;
  const session = stringOf(record, 'session_id');
  if (session === undefined || !SESSION.test(session)) return;
  const file = join(folder, `${session}.json`);
  const event = stringOf(record, 'hook_event_name');
  const asks = stringOf(record, 'tool_name') === 'AskUserQuestion';

  if (event === 'PreToolUse' && asks) {
    const call = stringOf(record, 'tool_use_id');
    if (call === undefined) return;
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    // Written whole and then moved, so the server never reads half a file.
    const temporary = `${file}.${process.pid}.tmp`;
    const content = { session, cwd: stringOf(record, 'cwd'), call, input: record['tool_input'] };
    writeFileSync(temporary, JSON.stringify(content), { mode: 0o600 });
    renameSync(temporary, file);
  } else if ((event === 'PostToolUse' && asks) || (event !== undefined && FORGETTING.has(event))) {
    rmSync(file, { force: true });
  }
};
