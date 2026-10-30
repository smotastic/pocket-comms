import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const VALIDATOR = fileURLToPath(new URL('./validate.mjs', import.meta.url));
const TEMPLATE_INITIALIZER = fileURLToPath(new URL('../template/init.mjs', import.meta.url));

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

function runValidator(...args) {
  return spawnSync(process.execPath, [VALIDATOR, ...args], { encoding: 'utf8' });
}

test('accepts branches with approved prefixes and no work-item ID', () => {
  for (const branch of [
    'feat/add-catalog-lookup',
    'fix/reject-duplicate-item-ids',
    'docs/update-contribution-guide',
    'chore/refresh-tooling',
  ]) {
    const result = runValidator('--branch', branch);
    assert.equal(result.status, 0, result.stderr);
  }
});

test('rejects branch names that are not lowercase kebab case', () => {
  const result = runValidator('--branch', 'feat/Invalid_Branch');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /expected:/);
});

test('accepts conventional commit subjects with an optional technical scope', () => {
  for (const title of [
    'feat(catalog): add item lookup',
    'docs: update the spec readme',
    'chore(_platform)!: refresh repository tooling',
  ]) {
    const result = runValidator('--title', title);
    assert.equal(result.status, 0, result.stderr);
  }
});

test('accepts commit subjects without a work-item ID', () => {
  const result = spawnSync(process.execPath, [VALIDATOR, '--commit', '-'], {
    encoding: 'utf8',
    input: 'feat(catalog): add item lookup',
  });

  assert.equal(result.status, 0, result.stderr);
});

test('uses neutral catalog examples in convention errors', () => {
  const result = runValidator('--commit', 'feature: add item lookup');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /example:\s+fix\(catalog\): reject duplicate item IDs/);
});

test('rejects non-technical scopes and malformed commit subjects', () => {
  for (const title of [
    'feat(BKM-001): add item lookup',
    'feat: BKM-001 add item lookup',
    'feature: add item lookup',
  ]) {
    const result = runValidator('--title', title);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /expected:/);
  }
});

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
