/**
 * The status line of a mission's Claude (spec 038), set in the mission settings the server writes:
 * `node <release>/apps/comms-server/dist/mission-statusline.js <state>/limits`. It keeps the
 * reset of a reached usage limit for the server and prints a short line. It must never get in
 * Claude's way: it always exits 0.
 */
import { handleStatus } from './usage-status.js';

const readStdin = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

const input = await readStdin().catch(() => '');
const folder = process.argv[2];
try {
  process.stdout.write(folder === undefined ? 'mission' : handleStatus(input, folder));
} catch {
  // A failed write only hides the limit from the server; Claude goes on regardless.
  process.stdout.write('mission');
}
process.exit(0);
