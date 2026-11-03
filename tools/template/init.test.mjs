// Proves the template initialization rewrites the repository identifiers and rejects unknown flags.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEMPLATE_INITIALIZER = fileURLToPath(new URL('./init.mjs', import.meta.url));

function createTemplateFixture() {
  const root = mkdtempSync(join(tmpdir(), 'template-init-'));
  const templateDir = join(root, 'tools/template');

  mkdirSync(templateDir, { recursive: true });
  writeFileSync(join(templateDir, 'init.mjs'), readFileSync(TEMPLATE_INITIALIZER));
  mkdirSync(join(root, '.github'));
  writeFileSync(join(root, '.github/CODEOWNERS'), '* @smotastic\n');
  writeFileSync(
    join(root, 'project.md'),
    '@pocket-comms/source pocket-comms smotastic/pocket-comms urn:pocket-comms:problem:x',
  );
  return root;
}

test('template initialization changes repository identifiers without tracker settings', (context) => {
  const root = createTemplateFixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const result = spawnSync(
    process.execPath,
    [
      join(root, 'tools/template/init.mjs'),
      '--repo',
      'acme/platform',
      '--scope',
      '@acme',
      '--name',
      'acme-platform',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  const expectedSummary = [
    '  repository acme/platform',
    '  scope      @acme',
    '  name       acme-platform',
  ].join('\n');

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(expectedSummary), result.stdout);
  assert.equal(
    readFileSync(join(root, 'project.md'), 'utf8'),
    '@acme/source acme-platform acme/platform urn:acme:problem:x',
  );
  assert.equal(readFileSync(join(root, '.github/CODEOWNERS'), 'utf8'), '* @acme\n');
});

test('template initialization rejects unsupported options', (context) => {
  const root = createTemplateFixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const result = spawnSync(
    process.execPath,
    [join(root, 'tools/template/init.mjs'), '--repo', 'acme/platform', '--unknown', 'value'],
    { cwd: root, encoding: 'utf8' },
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /unexpected argument: --unknown/);
});
