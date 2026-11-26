/**
 * The Claude Code hook that tells the server which `AskUserQuestion` call waits: Claude writes the
 * call to its session file only once it is answered. Set up for `PreToolUse` and `PostToolUse` of
 * `AskUserQuestion` and for `Stop`, `UserPromptSubmit` and `SessionStart`. In an hc terminal, a
 * `SessionStart` also labels the terminal with its session (spec 033).
 *
 * It must never get in Claude's way: it prints nothing and always exits 0. It runs whenever it is
 * started, also through the release's `current` link, so it has no entry-point check.
 */
import { homedir } from 'node:os';
import { handleHook, questionsFolder } from './claude-questions.js';
import { hookSessionLabel } from './hc-session.js';

const readStdin = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

const input = await readStdin().catch(() => '');
try {
  handleHook(input, questionsFolder(process.env, homedir()));
} catch {
  // A failed write only leaves the card unanswerable; Claude goes on regardless.
}
// Never fails, and gives up after two seconds: without the label hc shows only the screen.
await hookSessionLabel(input, process.env);
process.exit(0);
