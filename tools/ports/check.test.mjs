// Proves that the port structure check fires: `fixtures/violations` holds one service for each
// deliberate violation, and the check must report exactly the expected rule for each of them,
// while `fixtures/valid` and the real workspace must pass. A rule that matches nothing passes on a
// correct workspace too, so only the violations show that it works.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkPorts } from './check.mjs';

const root = join(import.meta.dirname, '..', '..');
const fixture = (name) => join(import.meta.dirname, 'fixtures', name);

// A violation as `<rule> <service>`, so that one comparison shows every missing or extra finding.
const found = ({ violations }) =>
  [...new Set(violations.map(({ rule, service }) => `${rule} ${service}`))].sort();

test('the real workspace has no violation', () => {
  const result = checkPorts({ root });
  assert.deepEqual(result.violations, []);
  assert.ok(result.stats.ports >= 3, `only ${result.stats.ports} ports found`);
  assert.ok(result.stats.adapterLayers >= 3, `only ${result.stats.adapterLayers} adapter layers`);
});

test('the valid fixture has no violation', () => {
  const result = checkPorts({ root: fixture('valid') });
  assert.deepEqual(result.violations, []);
  assert.ok(result.stats.portFiles > 0);
});

test('each deliberate violation fails with its rule', () => {
  assert.deepEqual(
    found(checkPorts({ root: fixture('violations') })),
    [
      'adapter-layer-name adapter-layer-name',
      'adapter-provides-inbound adapter-provides-inbound',
      'adapter-provides-no-port adapter-no-port',
      'adapter-static-layer adapter-static-layer',
      'inbound-without-layer inbound-layer-factory',
      'inbound-without-layer inbound-without-layer',
      'inbound-without-layer inbound-wrong-layer',
      'one-inbound-port-per-file one-inbound-port-per-file',
      'outbound-static-layer outbound-static-layer',
      'outbound-without-adapter adapter-outside-infrastructure',
      'outbound-without-adapter outbound-without-adapter',
      'outbound-without-adapter twin',
      'port-class-outside-ports port-class-outside-ports',
      'port-direction-suffix port-direction-suffix',
      'port-file-export port-file-export',
      'port-file-name port-file-name',
      'port-outside-application misplaced-file',
      'port-outside-application misplaced-folder',
      'port-outside-application misplaced-outside-src',
      'port-service-key port-service-key',
      'port-service-key port-service-key-literal',
      'unresolved-import unresolved-import',
      'unresolved-import unresolved-type-import',
      'unresolved-type adapter-any-type',
    ].sort(),
  );
});

// The symbols that one violation service reports for one rule, so each member form is proven.
const symbols = (result, rule, service) =>
  result.violations
    .filter((violation) => violation.rule === rule && violation.service === service)
    .map(({ symbol }) => symbol)
    .sort();

test('only the second inbound port of a port file fails', () => {
  assert.deepEqual(
    symbols(
      checkPorts({ root: fixture('violations') }),
      'one-inbound-port-per-file',
      'one-inbound-port-per-file',
    ),
    ['DeleteThingInbound'],
  );
});

test('an outbound port has no static layer in any member form', () => {
  assert.deepEqual(
    symbols(
      checkPorts({ root: fixture('violations') }),
      'outbound-static-layer',
      'outbound-static-layer',
    ),
    [
      'ThingOutbound.layerAny',
      'ThingOutbound.layerGetter',
      'ThingOutbound.layerInMemory',
      'ThingOutbound.layerMethod',
      'ThingOutbound.layerUnion',
    ],
  );
});

test('a port class outside a port file is found at any depth', () => {
  assert.deepEqual(
    symbols(
      checkPorts({ root: fixture('violations') }),
      'port-class-outside-ports',
      'port-class-outside-ports',
    ),
    ['ClockOutbound', 'ExpressionOutbound', 'FunctionOutbound', 'NamespaceOutbound'],
  );
});

test('the layer name rule checks every export name, re-exports included', () => {
  assert.deepEqual(
    symbols(
      checkPorts({ root: fixture('violations') }),
      'adapter-layer-name',
      'adapter-layer-name',
    ),
    ['inMemory', 'sqlLayer'],
  );
});

test('an adapter violation names the declaration, not a renamed re-export', () => {
  assert.deepEqual(
    symbols(
      checkPorts({ root: fixture('violations') }),
      'adapter-provides-no-port',
      'adapter-no-port',
    ),
    ['layerCache'],
  );
});

test('an export or a factory result typed any fails', () => {
  assert.deepEqual(
    symbols(checkPorts({ root: fixture('violations') }), 'unresolved-type', 'adapter-any-type'),
    ['layerLoose', 'layerLooseFactory'],
  );
});

test('an infrastructure class has no static layer in any member form', () => {
  assert.deepEqual(
    symbols(
      checkPorts({ root: fixture('violations') }),
      'adapter-static-layer',
      'adapter-static-layer',
    ),
    [
      'Child.layerInherited',
      'Expr.layer',
      'Factory.#layerHidden',
      'Factory.hidden',
      'Factory.layerSql',
      'Holder.layer',
      'Holder.layerMethod',
      'Loose.make',
      'Over.make',
    ],
  );
});

test('a workspace without port files fails', () => {
  const empty = mkdtempSync(join(tmpdir(), 'ports-check-'));
  try {
    assert.deepEqual(
      checkPorts({ root: empty }).violations.map(({ rule }) => rule),
      ['no-ports'],
    );
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

const run = (script, target) =>
  spawnSync('node', [script, '--root', target], { cwd: root, encoding: 'utf8' });

test('the command exits with 1 on a violation and prints one line for each', () => {
  const result = run('tools/ports/check.mjs', fixture('violations'));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /clock\.port\.ts:\d+ .* \[port-outside-application\]/);
});

test('the command exits with 0 on a valid workspace and prints what it checked', () => {
  const result = run('tools/ports/check.mjs', fixture('valid'));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /passed: 5 port files, 5 ports, 5 adapter layers/);
});

// Node keeps a symlinked script path in `process.argv`, so the command must not decide by that
// path whether it runs, or it would exit green without checking anything.
test('the command also runs through a symlinked path', () => {
  const linkDirectory = mkdtempSync(join(tmpdir(), 'ports-check-link-'));
  try {
    symlinkSync(root, join(linkDirectory, 'repo'));
    const result = run(join(linkDirectory, 'repo/tools/ports/check.mjs'), fixture('violations'));
    assert.equal(result.status, 1);
  } finally {
    rmSync(linkDirectory, { recursive: true, force: true });
  }
});
