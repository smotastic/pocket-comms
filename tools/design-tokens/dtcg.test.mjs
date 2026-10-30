// Proves that the DTCG validator rejects each kind of broken token file, and accepts a valid one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTokens, themeParity } from './dtcg.mjs';

const indigo = { colorSpace: 'srgb', components: [0.31, 0.27, 0.9], hex: '#4f46e5' };
const px = (value) => ({ value, unit: 'px' });

const primitives = {
  color: {
    $type: 'color',
    indigo: { 500: { $value: indigo } },
    black: { $value: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.08 } },
  },
  space: { $type: 'dimension', 4: { $value: { value: 1, unit: 'rem' } } },
  radius: { md: { $type: 'dimension', $value: px(10) } },
  font: {
    family: { sans: { $type: 'fontFamily', $value: ['Inter', 'system-ui', 'sans-serif'] } },
    weight: {
      bold: { $type: 'fontWeight', $value: 'bold' },
      regular: { $type: 'fontWeight', $value: 400 },
    },
    lineHeight: { body: { $type: 'number', $value: 1.5 } },
  },
  motion: {
    duration: { fast: { $type: 'duration', $value: { value: 120, unit: 'ms' } } },
    easing: { standard: { $type: 'cubicBezier', $value: [0.2, 0, 0, 1] } },
  },
};

const semantic = {
  color: {
    accent: { $type: 'color', $value: '{color.indigo.500}', $description: 'Primary actions.' },
    // An untyped alias takes the type of the token it references.
    link: { $value: '{color.accent}' },
  },
  shadow: {
    card: {
      $type: 'shadow',
      $value: [
        { color: '{color.black}', offsetX: px(0), offsetY: px(1), blur: px(2), spread: px(0) },
        {
          color: indigo,
          offsetX: px(0),
          offsetY: px(1),
          blur: '{radius.md}',
          spread: px(0),
          inset: false,
        },
      ],
    },
  },
};

const issuesOf = (...trees) =>
  validateTokens(trees.map((tree, index) => ({ file: `file${index}.json`, tree })));

// Replaces the value at a dotted path in a deep copy of the tree.
const withValue = (tree, path, value) => {
  const copy = structuredClone(tree);
  const keys = path.split('.');
  const parent = keys.slice(0, -1).reduce((node, key) => node[key], copy);
  parent[keys.at(-1)] = value;
  return copy;
};

test('a valid set of token files has no issues', () => {
  assert.deepEqual(issuesOf(primitives, semantic), []);
});

test('an unknown $type is an issue', () => {
  const tree = withValue(primitives, 'radius.md.$type', 'size');
  assert.match(issuesOf(tree).join('\n'), /radius\.md: unknown \$type "size"/);
});

test('a token without a $type and without an alias is an issue', () => {
  const tree = withValue(primitives, 'font.lineHeight.body', { $value: 1.5 });
  assert.match(issuesOf(tree).join('\n'), /font\.lineHeight\.body: no \$type/);
});

for (const [path, value, message] of [
  ['color.indigo.500.$value', '#4f46e5', /color\.indigo\.500: invalid color/],
  [
    'color.indigo.500.$value',
    { colorSpace: 'srgb', components: [1.2, 0, 0] },
    /color\.indigo\.500: invalid color/,
  ],
  [
    'color.indigo.500.$value',
    { colorSpace: 'rgb', components: [1, 0, 0] },
    /color\.indigo\.500: invalid color/,
  ],
  ['radius.md.$value', '10px', /radius\.md: invalid dimension/],
  ['radius.md.$value', { value: 10, unit: 'em' }, /radius\.md: invalid dimension/],
  ['font.family.sans.$value', [], /font\.family\.sans: invalid fontFamily/],
  ['font.weight.bold.$value', 'heavier', /font\.weight\.bold: invalid fontWeight/],
  ['font.weight.regular.$value', 1001, /font\.weight\.regular: invalid fontWeight/],
  ['font.lineHeight.body.$value', '1.5', /font\.lineHeight\.body: invalid number/],
  ['motion.duration.fast.$value', '120ms', /motion\.duration\.fast: invalid duration/],
  [
    'motion.easing.standard.$value',
    [1.2, 0, 0, 1],
    /motion\.easing\.standard: invalid cubicBezier/,
  ],
  ['motion.easing.standard.$value', [0.2, 0, 0], /motion\.easing\.standard: invalid cubicBezier/],
]) {
  test(`a malformed $value is an issue (${path} = ${JSON.stringify(value)})`, () => {
    assert.match(issuesOf(withValue(primitives, path, value)).join('\n'), message);
  });
}

test('a shadow with a missing or malformed part is an issue', () => {
  const tree = withValue(semantic, 'shadow.card.$value', {
    color: indigo,
    offsetX: px(0),
    offsetY: '1px',
  });
  assert.match(issuesOf(primitives, tree).join('\n'), /shadow\.card: invalid shadow/);
});

test('an alias to a missing token is an issue', () => {
  const tree = withValue(semantic, 'color.accent.$value', '{color.indigo.600}');
  assert.match(
    issuesOf(primitives, tree).join('\n'),
    /color\.accent: alias \{color\.indigo\.600\} does not resolve/,
  );
});

test('an alias to a group is an issue', () => {
  const tree = withValue(semantic, 'color.accent.$value', '{color.indigo}');
  assert.match(
    issuesOf(primitives, tree).join('\n'),
    /color\.accent: alias \{color\.indigo\} does not resolve/,
  );
});

test('an alias inside a composite value must resolve to the expected type', () => {
  const tree = withValue(semantic, 'shadow.card.$value.0.color', '{radius.md}');
  assert.match(issuesOf(primitives, tree).join('\n'), /shadow\.card: invalid shadow/);
});

test('an alias to a token of another type is an issue', () => {
  const tree = withValue(semantic, 'color.accent.$value', '{radius.md}');
  assert.match(
    issuesOf(primitives, tree).join('\n'),
    /color\.accent: alias \{radius\.md\} is a dimension, not a color/,
  );
});

test('an alias cycle is an issue', () => {
  const tree = withValue(semantic, 'color.accent.$value', '{color.link}');
  assert.match(issuesOf(primitives, tree).join('\n'), /color\.accent: alias cycle/);
});

test('a name with a reserved character is an issue', () => {
  const tree = { ...primitives, 'brand.blue': { $type: 'color', $value: indigo } };
  assert.match(issuesOf(tree).join('\n'), /brand\.blue: invalid name/);
});

test('an unsupported $ property is an issue', () => {
  const tree = { ...primitives, alias: { $extends: '{color}' } };
  assert.match(issuesOf(tree).join('\n'), /alias: unsupported property \$extends/);
});

test('a token defined in two files is an issue', () => {
  assert.match(
    issuesOf(primitives, { radius: { md: { $type: 'dimension', $value: px(8) } } }).join('\n'),
    /radius\.md: defined in file0\.json and file1\.json/,
  );
});

test('a file that is not an object of groups and tokens is an issue', () => {
  assert.match(issuesOf({ color: 'red' }).join('\n'), /color: neither a token nor a group/);
});

test('themes with the same token paths are in parity', () => {
  assert.deepEqual(themeParity({ light: semantic, dark: semantic }), []);
});

test('a token missing from one theme breaks parity', () => {
  const dark = withValue(semantic, 'color', { accent: semantic.color.accent });
  assert.deepEqual(themeParity({ light: semantic, dark }), [
    'color.link: missing in the dark theme',
  ]);
  assert.deepEqual(themeParity({ light: dark, dark: semantic }), [
    'color.link: missing in the light theme',
  ]);
});

test('an alias must match the type a token inherits from its group', () => {
  const tree = { color: { $type: 'color', size: { $value: '{radius.md}' } } };
  assert.match(
    issuesOf(primitives, tree).join('\n'),
    /color\.size: alias \{radius\.md\} is a dimension, not a color/,
  );
});

test('a token with child tokens is an issue', () => {
  const tree = withValue(primitives, 'radius.md.small', { $value: px(4) });
  assert.match(issuesOf(tree).join('\n'), /radius\.md: a token cannot contain small/);
});

test('a token at the root or an empty name is an issue', () => {
  assert.match(
    issuesOf({ $type: 'number', $value: 1 }).join('\n'),
    /\(root\): a file must be a group/,
  );
  assert.match(issuesOf({ '': { $type: 'number', $value: 1 } }).join('\n'), /: invalid name/);
});
