// Fails when a committed OpenAPI document is stale: it regenerates every server app's document
// and compares the working tree with what git holds (ADR 0005).
import { execFileSync } from 'node:child_process';

const run = (command, args) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

run('pnpm', ['nx', 'run-many', '--target=openapi', '--outputStyle=static', '--skipNxCache']);

// A staged document counts as committed; the working tree must match it, and no document may be
// missing from git.
const changed = run('git', ['status', '--porcelain', '--', ':(glob)**/api/openapi.json'])
  .split('\n')
  .filter((line) => line.length > 1 && line[1] !== ' ');

if (changed.length > 0) {
  console.error('The committed OpenAPI documents are stale. Run `pnpm nx run-many -t openapi`:');
  for (const line of changed) console.error(`  ${line}`);
  process.exit(1);
}
console.log('✔ The committed OpenAPI documents are current.');
