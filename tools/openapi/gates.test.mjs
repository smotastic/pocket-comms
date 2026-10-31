// Proves that the OpenAPI gates fire: each case feeds a deliberately broken document to the gate
// and expects it to fail, next to the valid document that must pass.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const root = join(import.meta.dirname, '..', '..');
const valid = JSON.parse(readFileSync(join(root, 'apps/comms-server/api/openapi.json'), 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'openapi-gates-'));
after(() => rmSync(work, { recursive: true, force: true }));

const write = (name, document) => {
  const file = join(work, name);
  writeFileSync(file, JSON.stringify(document));
  return file;
};

const lint = (document) =>
  spawnSync(
    'pnpm',
    ['exec', 'redocly', 'lint', '--config', 'redocly.yaml', write('doc.json', document)],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

const broken = (change) => {
  const document = structuredClone(valid);
  change(document);
  return document;
};

const agentParameters = (document) => document.paths['/api/v1/agents/{agent}'].get.parameters;
const prompt = (document) => document.paths['/api/v1/agents/{agent}/prompt'].post;

test('openapi:lint accepts the committed document', () => {
  assert.equal(lint(valid).status, 0);
});

const cases = {
  'operation-description': (document) => delete prompt(document).description,
  'parameter-description': (document) => delete agentParameters(document)[0].description,
  'rule/parameter-example': (document) => delete agentParameters(document)[0].schema.examples,
  'rule/property-description': (document) =>
    delete document.components.schemas.Screen.properties.text.description,
  'rule/property-example': (document) =>
    delete document.components.schemas.Screen.properties.text.examples,
  'operation-4xx-response': (document) => {
    const responses = prompt(document).responses;
    for (const status of Object.keys(responses))
      if (status.startsWith('4')) delete responses[status];
  },
};

for (const [rule, change] of Object.entries(cases)) {
  test(`openapi:lint fails with ${rule}`, () => {
    const result = lint(broken(change));
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, new RegExp(rule.replace('/', '\\/')));
  });
}

const oasdiff = (base, revision) =>
  spawnSync(
    'bash',
    ['tools/openapi/oasdiff.sh', write('base.json', base), write('revision.json', revision)],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

test('openapi:diff accepts an unchanged document', () => {
  assert.equal(oasdiff(valid, valid).status, 0);
});

test('openapi:diff fails when a response field is removed from /api/v1', () => {
  const revision = broken((document) => {
    const screen = document.components.schemas.Screen;
    delete screen.properties.text;
    screen.required = screen.required.filter((name) => name !== 'text');
  });
  const result = oasdiff(valid, revision);
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stdout, /response-property-removed|response-required-property-removed/);
});

// A fixed identity, so the fixture commit needs no git configuration (CI runners have none).
const fixtureIdentity = {
  GIT_AUTHOR_NAME: 'openapi gates',
  GIT_AUTHOR_EMAIL: 'openapi-gates@example.invalid',
  GIT_COMMITTER_NAME: 'openapi gates',
  GIT_COMMITTER_EMAIL: 'openapi-gates@example.invalid',
};

// A base commit that holds only the given documents, built from objects without touching refs.
const baseCommit = (files) => {
  const run = (args, input) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      input,
      env: { ...process.env, ...fixtureIdentity },
    }).trim();
  const entries = new Map();
  for (const [path, content] of Object.entries(files)) {
    entries.set(path, run(['hash-object', '-w', '--stdin'], JSON.stringify(content)));
  }
  const tree = (prefix) => {
    const children = new Map();
    for (const [path, blob] of entries) {
      if (!path.startsWith(prefix)) continue;
      const [head, ...rest] = path.slice(prefix.length).split('/');
      children.set(head, rest.length === 0 ? ['blob', blob] : ['tree', null]);
    }
    const lines = [...children].map(
      ([name, [type, blob]]) =>
        `${type === 'blob' ? '100644' : '040000'} ${type} ${blob ?? tree(`${prefix}${name}/`)}\t${name}`,
    );
    return run(['mktree'], `${lines.join('\n')}\n`);
  };
  return run(['commit-tree', tree(''), '-m', 'openapi gate fixture']);
};

const diff = (base) =>
  spawnSync('node', ['tools/openapi/diff.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, OPENAPI_BASE_REF: base },
  });

const server = 'apps/comms-server/api/openapi.json';

test('openapi:diff fails when the base ref does not exist', () => {
  assert.equal(diff('refs/heads/does-not-exist').status, 2);
});

test('openapi:diff accepts documents equal to the base', () => {
  const result = diff(baseCommit({ [server]: valid }));
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('openapi:diff fails when the branch drops a response field of the base', () => {
  const withExtraField = broken((document) => {
    document.components.schemas.Screen.properties.note = { type: 'string' };
    document.components.schemas.Screen.required.push('note');
  });
  const result = diff(baseCommit({ [server]: withExtraField }));
  assert.equal(result.status, 1, result.stdout + result.stderr);
});

test('openapi:diff fails when the branch removes a document of the base', () => {
  const removed = 'apps/gone/api/openapi.json';
  const result = diff(baseCommit({ [server]: valid, [removed]: valid }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /apps\/gone\//);
});

test('openapi:diff accepts the removal of a document listed as retired', () => {
  const retired = 'blueprints/bookmarks/apps/server/api/openapi.json';
  const result = diff(baseCommit({ [server]: valid, [retired]: valid }));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /retired/);
});
