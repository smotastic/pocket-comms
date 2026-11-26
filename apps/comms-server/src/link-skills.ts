import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { linkSkills } from './skills.js';

// Usage: node dist/link-skills.js [--from <skills folder>] [--to <agent skills folder>]...
// A deploy passes `--from <release root>/current/apps/comms-server/skills`, the stable path.
const { values } = parseArgs({
  options: { from: { type: 'string' }, to: { type: 'string', multiple: true } },
});
const from = resolve(values.from ?? fileURLToPath(new URL('../skills', import.meta.url)));
const targets = values.to ?? [
  join(homedir(), '.claude', 'skills'),
  join(homedir(), '.pi', 'agent', 'skills'),
];

const report = linkSkills({ from, targets });
for (const path of report.linked) console.log(`linked   ${path}`);
for (const path of report.removed) console.log(`removed  ${path}`);
for (const path of report.conflicts)
  console.error(`conflict ${path}: a different skill has this name`);
console.log(`${report.kept.length} already linked`);
process.exitCode = report.conflicts.length > 0 ? 1 : 0;
