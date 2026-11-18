/**
 * A Claude Code hook that tells the server which `AskUserQuestion` call waits. Claude writes the
 * call to its session file only once it is answered, so the server reads the waiting call from
 * the file this hook keeps per session in `<state>/questions/`.
 *
 * Set up for `PreToolUse` and `PostToolUse` of `AskUserQuestion` and for `Stop`. It must never
 * get in Claude's way: it prints nothing and always exits 0. It uses Node's built-ins only, so it
 * runs from the built release without the workspace.
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SESSION = /^[A-Za-z0-9-]{1,128}$/u;

const stringOf = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

/** Where the server keeps the waiting calls, as its `COMMS_STATE_DIR` setting says. */
export const questionsFolder = (
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string => join(env['COMMS_STATE_DIR'] ?? join(home, '.pocket-comms'), 'questions');

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
  } else if ((event === 'PostToolUse' && asks) || event === 'Stop') {
    rmSync(file, { force: true });
  }
};

const readStdin = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    handleHook(await readStdin(), questionsFolder(process.env, homedir()));
  } catch {
    // A failed write only leaves the card unanswerable; Claude goes on regardless.
  }
  process.exit(0);
}
