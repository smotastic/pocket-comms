// Proves that the boundary rules fire: each case writes a file that breaks one rule into the
// comms service, runs dependency-cruiser on it, and expects exactly that rule in the result. A rule
// that silently matches nothing passes `pnpm dep-cruise` too, so only a deliberate violation shows
// that it works.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = join(import.meta.dirname, '..', '..');
const domainSrc = 'packages/comms/domain/src';
const applicationSrc = 'packages/comms/application/src';
const handlersSrc = 'packages/comms/api/src';
const webSrc = 'apps/comms-web/src';

const cruise = (file) => {
  let output;
  try {
    output = execFileSync(
      'pnpm',
      ['exec', 'depcruise', '--config', '.dependency-cruiser.cjs', '--output-type', 'json', file],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    // dependency-cruiser exits non-zero when it finds a violation; its JSON is still on stdout.
    output = error.stdout;
  }
  return JSON.parse(output).summary.violations.map((violation) => violation.rule.name);
};

// Writes the file, creating only the folders that do not exist yet, and removes both afterwards.
const withViolation = (file, source, check) => {
  const created = [];
  for (let dir = dirname(join(root, file)); !existsSync(dir); dir = dirname(dir)) {
    created.unshift(dir);
  }
  created.forEach((dir) => mkdirSync(dir));
  writeFileSync(join(root, file), source);
  try {
    check();
  } finally {
    rmSync(join(root, file), { force: true });
    created.reverse().forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  }
};

test('no-framework-imports-in-domain fires for an effect service module', () => {
  const file = `${domainSrc}/boundary-violation.ts`;
  withViolation(
    file,
    "import * as Effect from 'effect/Effect';\nexport const x = Effect.void;\n",
    () => assert.deepEqual(cruise(file), ['no-framework-imports-in-domain']),
  );
});

test('no-framework-imports-in-domain fires for the effect barrel', () => {
  const file = `${domainSrc}/boundary-violation.ts`;
  withViolation(file, "import { Schema } from 'effect';\nexport const x = Schema.String;\n", () =>
    assert.deepEqual(cruise(file), ['no-framework-imports-in-domain']),
  );
});

test('no-framework-imports-in-domain fires for a Node.js built-in module', () => {
  const file = `${domainSrc}/boundary-violation.ts`;
  withViolation(
    file,
    "import { readFileSync } from 'node:fs';\nexport const x = readFileSync;\n",
    () => assert.deepEqual(cruise(file), ['no-framework-imports-in-domain']),
  );
});

test('no-framework-imports-in-domain fires for a package that does not resolve', () => {
  const file = `${domainSrc}/boundary-violation.ts`;
  withViolation(file, "import { eq } from 'drizzle-orm';\nexport const x = eq;\n", () =>
    assert.deepEqual(cruise(file), ['no-framework-imports-in-domain']),
  );
});

test('no-framework-imports-in-domain allows a pure effect subpath', () => {
  const file = `${domainSrc}/boundary-violation.ts`;
  withViolation(
    file,
    "import * as Schema from 'effect/Schema';\nexport const x = Schema.String;\n",
    () => assert.deepEqual(cruise(file), []),
  );
});

test('no-domain-in-handlers fires for a handler file that imports a domain file', () => {
  const file = `${handlersSrc}/boundary-violation.handlers.ts`;
  withViolation(
    file,
    "import { agentRef } from '../../domain/src/index.js';\nexport const x = agentRef;\n",
    () => assert.deepEqual(cruise(file), ['no-domain-in-handlers']),
  );
});

test('no-domain-to-outer-layers fires for a domain file that imports the application', () => {
  const file = `${domainSrc}/boundary-violation.ts`;
  withViolation(
    file,
    "import { AgentsInbound } from '../../application/src/index.js';\nexport const x = AgentsInbound;\n",
    () => assert.deepEqual(cruise(file), ['no-domain-to-outer-layers']),
  );
});

test('no-application-to-adapters fires for a use case that imports infrastructure', () => {
  const file = `${applicationSrc}/boundary-violation.ts`;
  withViolation(
    file,
    "import { Herdr } from '../../infrastructure/src/index.js';\nexport const x = Herdr;\n",
    () => assert.deepEqual(cruise(file), ['no-application-to-adapters']),
  );
});

test('no-contracts-in-core fires for a use case that imports the contract', () => {
  const file = `${applicationSrc}/boundary-violation.ts`;
  withViolation(
    file,
    "import { KEYS } from '../../contract/src/index.js';\nexport const x = KEYS;\n",
    () => assert.deepEqual(cruise(file), ['no-contracts-in-core']),
  );
});

test('no-server-code-in-web fires for a web file that imports the domain', () => {
  const file = `${webSrc}/boundary-violation.ts`;
  withViolation(
    file,
    "import { agentRef } from '../../../packages/comms/domain/src/index.js';\nexport const x = agentRef;\n",
    () => assert.deepEqual(cruise(file), ['no-server-code-in-web']),
  );
});

test('no-cross-service fires for a service that imports another service', () => {
  const file = 'packages/boundary-a/domain/src/index.ts';
  withViolation(file, "export const a = 'a';\n", () => {
    const other = 'packages/boundary-b/domain/src/index.ts';
    withViolation(
      other,
      "import { a } from '../../../boundary-a/domain/src/index.js';\nexport const b = a;\n",
      () => assert.deepEqual(cruise(other), ['no-cross-service']),
    );
  });
});

test('no-blueprint-imports fires for a package that imports a blueprint', () => {
  const blueprint = 'blueprints/boundary-example/packages/domain/src/index.ts';
  withViolation(blueprint, "export const a = 'a';\n", () => {
    const file = 'packages/boundary-a/domain/src/index.ts';
    withViolation(
      file,
      "import { a } from '../../../../blueprints/boundary-example/packages/domain/src/index.js';\nexport const x = a;\n",
      () => assert.deepEqual(cruise(file), ['no-blueprint-imports']),
    );
  });
});

test('observability-in-servers-only fires for an adapter that imports the observability wiring', () => {
  const file = `${handlersSrc}/boundary-violation.ts`;
  withViolation(
    file,
    "import { Observability } from '@pocket-comms/backend-shared/observability';\nexport const x = Observability;\n",
    () => assert.deepEqual(cruise(file), ['observability-in-servers-only']),
  );
});

test('observability-in-servers-only allows a server composition root', () => {
  const file = 'apps/comms-server/src/boundary-violation.ts';
  withViolation(
    file,
    "import { Observability } from '../../../packages/backend-shared/src/observability/index.js';\nexport const x = Observability;\n",
    () => assert.deepEqual(cruise(file), []),
  );
});

test('agent-runtime-in-infrastructure-only fires for an application file that imports Pi', () => {
  const file = `${applicationSrc}/boundary-violation.ts`;
  withViolation(
    file,
    "import { Agent } from '@earendil-works/pi-agent-core';\nexport const x = Agent;\n",
    () => assert.deepEqual(cruise(file), ['agent-runtime-in-infrastructure-only']),
  );
});

test('agent-runtime-in-infrastructure-only allows the infrastructure layer', () => {
  const file = 'packages/comms/infrastructure/src/boundary-violation.ts';
  withViolation(
    file,
    "import { Agent } from '@earendil-works/pi-agent-core';\nexport const x = Agent;\n",
    () => assert.deepEqual(cruise(file), []),
  );
});

test('no-design-in-server-code fires for a server file that imports the tokens', () => {
  const file = 'apps/comms-server/src/boundary-violation.ts';
  withViolation(
    file,
    "import { tokens } from '../../../packages/design/tokens/src/index.js';\nexport const x = tokens;\n",
    () => assert.deepEqual(cruise(file), ['no-design-in-server-code']),
  );
});

test('no-design-in-server-code fires for a service package that imports the tokens', () => {
  const file = 'packages/boundary-a/application/src/index.ts';
  withViolation(
    file,
    "import { tokens } from '../../../design/tokens/src/index.js';\nexport const x = tokens;\n",
    () => assert.deepEqual(cruise(file), ['no-design-in-server-code']),
  );
});

test('no-design-in-server-code fires for a shared package that imports the tokens', () => {
  const file = 'packages/backend-shared/src/boundary-violation.ts';
  withViolation(
    file,
    "import { tokens } from '../../design/tokens/src/index.js';\nexport const x = tokens;\n",
    () => assert.deepEqual(cruise(file), ['no-design-in-server-code']),
  );
});

test('no-design-in-server-code fires for an app that is not a web app', () => {
  const file = 'apps/boundary-server/src/main.ts';
  withViolation(
    file,
    "import { tokens } from '../../../packages/design/tokens/src/index.js';\nexport const x = tokens;\n",
    () => assert.deepEqual(cruise(file), ['no-design-in-server-code']),
  );
});

test('no-workspace-imports-in-tokens fires for a tokens file that imports a workspace package', () => {
  const file = 'packages/design/tokens/src/boundary-violation.ts';
  withViolation(
    file,
    "import * as Shared from '../../../backend-shared/src/index.js';\nexport const x = Shared;\n",
    () => assert.deepEqual(cruise(file), ['no-workspace-imports-in-tokens']),
  );
});

test('no-tokens-in-web fires for a web file that imports the tokens directly', () => {
  const file = `${webSrc}/boundary-violation.ts`;
  withViolation(
    file,
    "import { tokens } from '../../../packages/design/tokens/src/index.js';\nexport const x = tokens;\n",
    () => assert.deepEqual(cruise(file), ['no-tokens-in-web']),
  );
});

test('a web app may import the UI kit', () => {
  const file = `${webSrc}/boundary-violation.ts`;
  withViolation(
    file,
    "import { tokens } from '../../../packages/design/ui/src/index.js';\nexport const x = tokens;\n",
    () => assert.deepEqual(cruise(file), []),
  );
});

test('ui-only-on-tokens fires for a UI kit file that imports other workspace code', () => {
  const file = 'packages/design/ui/src/boundary-violation.ts';
  withViolation(
    file,
    "import * as Shared from '../../../backend-shared/src/index.js';\nexport const x = Shared;\n",
    () => assert.deepEqual(cruise(file), ['ui-only-on-tokens']),
  );
});

test('no-css-in-web fires for a web file that imports a stylesheet', () => {
  const css = `${webSrc}/boundary-violation.css`;
  withViolation(css, '.x { color: red; }\n', () => {
    const file = `${webSrc}/boundary-violation.ts`;
    withViolation(file, "import './boundary-violation.css';\nexport const x = 1;\n", () =>
      assert.deepEqual(cruise(file), ['no-css-in-web']),
    );
  });
});
