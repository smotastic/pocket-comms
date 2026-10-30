// Fails when a web app's committed route tree differs from what `tsr generate` writes for its route
// files (ADR 0011). Run it in the app's folder; the committed file is restored either way, so the
// check never changes the working tree.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const { generatedRouteTree = './src/routeTree.gen.ts' } = JSON.parse(
  await readFile('tsr.config.json', 'utf8'),
);

const committed = await readFile(generatedRouteTree, 'utf8');
let fresh;
try {
  execFileSync('pnpm', ['exec', 'tsr', 'generate'], { stdio: 'pipe' });
  fresh = await readFile(generatedRouteTree, 'utf8');
} finally {
  await writeFile(generatedRouteTree, committed);
}

if (fresh !== committed) {
  console.error(
    `The committed route tree ${generatedRouteTree} is stale. Run \`pnpm exec tsr generate\` in ` +
      `${process.cwd()} and commit the file.`,
  );
  process.exit(1);
}
console.log(`✔ The route tree ${generatedRouteTree} is current.`);
