// Builds the design tokens (ADR 0009): `tokens.css` with the custom properties of each theme and
// `tokens.ts` with the typed `var(--…)` names. Run it directly to regenerate `src/generated/`.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import StyleDictionary from 'style-dictionary';

const SRC = join(import.meta.dirname, 'src');

/** The token files, by role. Primitives feed the aliases but are never emitted. */
export const SOURCES = {
  primitives: join(SRC, 'primitives.tokens.json'),
  base: join(SRC, 'base.tokens.json'),
  light: join(SRC, 'theme.light.tokens.json'),
  dark: join(SRC, 'theme.dark.tokens.json'),
};

export const GENERATED_DIR = join(SRC, 'generated');

const HEADER = 'Generated from src/*.tokens.json by style-dictionary.mjs. Do not edit.';

/** The transformed tokens of one theme, without the primitives. */
const themeTokens = async (theme) => {
  const dictionary = new StyleDictionary({
    source: [SOURCES.primitives, SOURCES.base, SOURCES[theme]],
    usesDtcg: true,
    log: { verbosity: 'silent', warnings: 'disabled' },
    hooks: {
      transforms: {
        // DTCG writes dimensions and durations as `{ value, unit }`; CSS wants `12px`, `150ms`.
        'dtcg/measure': {
          type: 'value',
          filter: (token) => token.$type === 'dimension' || token.$type === 'duration',
          transform: (token) => `${token.$value.value}${token.$value.unit}`,
        },
      },
    },
    platforms: {
      css: {
        transforms: [
          'name/kebab',
          'color/css',
          'dtcg/measure',
          'fontFamily/css',
          'cubicBezier/css',
          'shadow/css/shorthand',
        ],
      },
    },
  });
  const { allTokens } = await dictionary.getPlatformTokens('css');
  return allTokens.filter((token) => token.filePath !== SOURCES.primitives);
};

const declarations = (tokens, indent) =>
  tokens.map((token) => `${indent}--${token.name}: ${token.$value};`).join('\n');

const css = (light, dark) => {
  const darkOnly = dark.filter((token) => token.filePath === SOURCES.dark);
  return `/* ${HEADER} */
:root {
${declarations(light, '  ')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${declarations(darkOnly, '    ')}
  }
}

:root[data-theme='dark'] {
${declarations(darkOnly, '  ')}
}
`;
};

const key = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`);

const tree = (tokens) => {
  const root = {};
  for (const token of tokens) {
    const parent = token.path.slice(0, -1).reduce((node, name) => (node[name] ??= {}), root);
    parent[token.path.at(-1)] = `var(--${token.name})`;
  }
  return root;
};

const literal = (node, indent) =>
  typeof node === 'string'
    ? `'${node}'`
    : `{\n${Object.entries(node)
        .map(([name, child]) => `${indent}  ${key(name)}: ${literal(child, `${indent}  `)},`)
        .join('\n')}\n${indent}}`;

const ts = (light) => `// ${HEADER}

/** The CSS custom property of every semantic token, as a \`var(--…)\` reference. */
export const tokens = ${literal(tree(light), '')} as const;
`;

/** Writes `tokens.css` and `tokens.ts` to `outDir`. */
export const buildTokens = async ({ outDir }) => {
  const [light, dark] = await Promise.all([themeTokens('light'), themeTokens('dark')]);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'tokens.css'), css(light, dark));
  await writeFile(join(outDir, 'tokens.ts'), ts(light));
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await buildTokens({ outDir: GENERATED_DIR });
}
