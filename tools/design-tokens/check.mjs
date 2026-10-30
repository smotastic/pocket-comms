// Fails when the design token files are not valid DTCG, the two themes define different tokens,
// or the committed generated output differs from a fresh build (ADR 0009).
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  buildTokens,
  GENERATED_DIR,
  SOURCES,
} from '../../packages/design/tokens/style-dictionary.mjs';
import { themeParity, validateTokens } from './dtcg.mjs';
import { staleFiles } from './stale.mjs';

const read = async (path) => ({
  file: relative(process.cwd(), path),
  tree: JSON.parse(await readFile(path, 'utf8')),
});

const [primitives, base, light, dark] = await Promise.all(
  [SOURCES.primitives, SOURCES.base, SOURCES.light, SOURCES.dark].map(read),
);

const issues = [
  ...validateTokens([primitives, base, light]).map((issue) => `light: ${issue}`),
  ...validateTokens([primitives, base, dark]).map((issue) => `dark: ${issue}`),
  ...themeParity({ light: light.tree, dark: dark.tree }),
];

if (issues.length > 0) {
  console.error('The design tokens are invalid:');
  for (const issue of issues) console.error(`  ${issue}`);
  process.exit(1);
}

let stale = [];
const freshDir = await mkdtemp(join(tmpdir(), 'design-tokens-'));
try {
  await buildTokens({ outDir: freshDir });
  stale = await staleFiles({ freshDir, committedDir: GENERATED_DIR });
} finally {
  await rm(freshDir, { recursive: true, force: true });
}
if (stale.length > 0) {
  console.error(
    'The committed design token output is stale. Run `pnpm nx run design-tokens:generate`:',
  );
  for (const file of stale) console.error(`  ${file}`);
  process.exit(1);
}
console.log('✔ The design tokens are valid DTCG, the themes match, and the output is current.');
