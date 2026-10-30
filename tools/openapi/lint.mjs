// Lints every committed OpenAPI document with the repository rules in `redocly.yaml`.
import { execFileSync } from 'node:child_process';
import { documents } from './documents.mjs';

const files = documents();
if (files.length === 0) {
  console.log('No OpenAPI documents to lint.');
  process.exit(0);
}
execFileSync('pnpm', ['exec', 'redocly', 'lint', '--config', 'redocly.yaml', ...files], {
  stdio: 'inherit',
});
