// Fails on a breaking change between each OpenAPI document and its version on the base ref
// (default `master`), with oasdiff in its pinned image (ADR 0005). A document that the base ref
// has and the branch lost is breaking too, unless `retired.json` lists it with the reason it may
// go. Needs Docker.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { documents } from './documents.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const isDocument = (path) => path.endsWith('/api/openapi.json');
const retired = JSON.parse(readFileSync(join(import.meta.dirname, 'retired.json'), 'utf8'));

const base = process.env.OPENAPI_BASE_REF ?? 'master';
if (spawnSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).status !== 0) {
  console.error(`The base ref ${base} does not exist; fetch it or set OPENAPI_BASE_REF.`);
  process.exit(2);
}

const current = documents();
const onBase = git('ls-tree', '-r', '--name-only', base).split('\n').filter(isDocument);
if (current.length === 0 && onBase.length === 0) {
  console.error('No OpenAPI document found on the branch or on the base ref.');
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'openapi-diff-'));
let failed = false;
try {
  for (const document of onBase.filter((path) => !current.includes(path))) {
    if (Object.hasOwn(retired, document)) {
      console.log(`• ${document} is retired: ${retired[document]}`);
      continue;
    }
    console.error(`✖ ${document} exists on ${base} but not on this branch.`);
    failed = true;
  }
  for (const document of current) {
    if (!onBase.includes(document)) {
      console.log(`• ${document} is new on this branch; nothing to compare.`);
      continue;
    }
    const baseFile = join(work, 'base.json');
    writeFileSync(baseFile, git('show', `${base}:${document}`));
    console.log(`• ${document} against ${base}`);
    const result = spawnSync('bash', ['tools/openapi/oasdiff.sh', baseFile, document], {
      stdio: 'inherit',
    });
    if (result.status !== 0) failed = true;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
