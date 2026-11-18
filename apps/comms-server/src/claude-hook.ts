/**
 * The Claude Code hook that tells the server which `AskUserQuestion` call waits: Claude writes the
 * call to its session file only once it is answered. Set up for `PreToolUse` and `PostToolUse` of
 * `AskUserQuestion` and for `Stop`, `UserPromptSubmit` and `SessionStart`.
 *
 * It must never get in Claude's way: it prints nothing and always exits 0. It runs whenever it is
 * started, also through the release's `current` link, so it has no entry-point check.
 */
import { homedir } from 'node:os';
import { handleHook, questionsFolder } from './claude-questions.js';

const readStdin = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

try {
  handleHook(await readStdin(), questionsFolder(process.env, homedir()));
} catch {
  // A failed write only leaves the card unanswerable; Claude goes on regardless.
}
process.exit(0);
