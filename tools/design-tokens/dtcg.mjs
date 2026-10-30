// Validates design token files against the DTCG format (2025.10) for the token types this
// repository uses. Style Dictionary reads DTCG but lets malformed values through, so this check is
// the gate (ADR 0009). Unsupported features ($ref, $extends, $root) are rejected, not ignored.

const TOKEN_PROPERTIES = new Set(['$value', '$type', '$description', '$extensions', '$deprecated']);
const GROUP_PROPERTIES = new Set(['$type', '$description', '$extensions', '$deprecated']);

const COLOR_SPACES = new Set([
  'srgb',
  'srgb-linear',
  'display-p3',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz-d50',
  'xyz-d65',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'hsl',
  'hwb',
]);

const FONT_WEIGHT_NAMES = new Set([
  'thin',
  'hairline',
  'extra-light',
  'ultra-light',
  'light',
  'normal',
  'regular',
  'book',
  'medium',
  'semi-bold',
  'demi-bold',
  'bold',
  'extra-bold',
  'ultra-bold',
  'black',
  'heavy',
  'extra-black',
  'ultra-black',
]);

const ALIAS = /^\{([^{}]+)\}$/;

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const hasOnlyKeys = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));
const inUnitRange = (value) => isNumber(value) && value >= 0 && value <= 1;

const isColor = (value) =>
  isObject(value) &&
  hasOnlyKeys(value, ['colorSpace', 'components', 'alpha', 'hex']) &&
  COLOR_SPACES.has(value.colorSpace) &&
  Array.isArray(value.components) &&
  value.components.length === 3 &&
  value.components.every((component) =>
    component === 'none'
      ? true
      : value.colorSpace === 'srgb'
        ? inUnitRange(component)
        : isNumber(component),
  ) &&
  (value.alpha === undefined || inUnitRange(value.alpha)) &&
  (value.hex === undefined || (typeof value.hex === 'string' && /^#[0-9a-f]{6}$/i.test(value.hex)));

const isMeasure = (units) => (value) =>
  isObject(value) &&
  hasOnlyKeys(value, ['value', 'unit']) &&
  isNumber(value.value) &&
  units.includes(value.unit);

/** The value shape of each supported type. A composite type checks its sub-values with `part`. */
const VALUE_CHECKS = {
  color: isColor,
  dimension: isMeasure(['px', 'rem']),
  duration: (value) => isMeasure(['ms', 's'])(value) && value.value >= 0,
  fontFamily: (value) =>
    (typeof value === 'string' && value.length > 0) ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.every((name) => typeof name === 'string' && name.length > 0)),
  fontWeight: (value) =>
    (isNumber(value) && value >= 1 && value <= 1000) || FONT_WEIGHT_NAMES.has(value),
  cubicBezier: (value) =>
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(isNumber) &&
    inUnitRange(value[0]) &&
    inUnitRange(value[2]),
  number: isNumber,
  shadow: (value, part) => {
    const isLayer = (layer) =>
      isObject(layer) &&
      hasOnlyKeys(layer, ['color', 'offsetX', 'offsetY', 'blur', 'spread', 'inset']) &&
      part(layer.color, 'color') &&
      ['offsetX', 'offsetY', 'blur', 'spread'].every((key) => part(layer[key], 'dimension')) &&
      (layer.inset === undefined || typeof layer.inset === 'boolean');
    return Array.isArray(value) ? value.length > 0 && value.every(isLayer) : isLayer(value);
  },
};

const TYPES = new Set(Object.keys(VALUE_CHECKS));

/** Collects every token of a tree as `path → { file, type, value }`, and the structural issues. */
const collect = (file, node, path, inheritedType, tokens, issues) => {
  const name = path.join('.');
  if (!isObject(node)) {
    issues.push(`${name}: neither a token nor a group`);
    return;
  }
  const isToken = '$value' in node;
  if (isToken && path.length === 0) {
    issues.push('(root): a file must be a group, not a token');
    return;
  }
  const allowed = isToken ? TOKEN_PROPERTIES : GROUP_PROPERTIES;
  for (const key of Object.keys(node).filter((key) => key.startsWith('$'))) {
    if (!allowed.has(key)) issues.push(`${name || '(root)'}: unsupported property ${key}`);
  }
  if (node.$type !== undefined && !TYPES.has(node.$type)) {
    issues.push(`${name}: unknown $type ${JSON.stringify(node.$type)}`);
  }
  const type = node.$type ?? inheritedType;
  if (isToken) {
    const existing = tokens.get(name);
    if (existing === undefined) tokens.set(name, { file, type, value: node.$value });
    else issues.push(`${name}: defined in ${existing.file} and ${file}`);
    for (const key of Object.keys(node).filter((key) => !key.startsWith('$'))) {
      issues.push(`${name}: a token cannot contain ${key}`);
    }
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (key.length === 0 || /[{}.]/.test(key)) {
      issues.push(`${[...path, key].join('.')}: invalid name`);
      continue;
    }
    collect(file, child, [...path, key], type, tokens, issues);
  }
};

/** Follows an alias chain to a token with a literal value; returns its path or an issue. */
const resolve = (tokens, start) => {
  const seen = new Set();
  let path = start;
  for (;;) {
    if (seen.has(path)) return { issue: 'alias cycle' };
    seen.add(path);
    const token = tokens.get(path);
    if (token === undefined) return { issue: 'unresolved' };
    const alias = typeof token.value === 'string' ? ALIAS.exec(token.value) : null;
    if (alias === null) return { path };
    path = alias[1];
  }
};

/** The type of a token: its own or inherited `$type`, else that of the token its alias resolves to. */
const typeOf = (tokens, path) => {
  const token = tokens.get(path);
  if (token?.type !== undefined) return token.type;
  const resolved = resolve(tokens, path);
  return resolved.path === undefined ? undefined : tokens.get(resolved.path)?.type;
};

/**
 * Validates token files that together form one theme, so aliases may cross files. Returns one
 * issue per problem as `<token path>: <reason>`; an empty list means the files are valid.
 *
 * @param {ReadonlyArray<{ file: string, tree: unknown }>} files
 * @returns {string[]}
 */
export const validateTokens = (files) => {
  const tokens = new Map();
  const issues = [];
  for (const { file, tree } of files) collect(file, tree, [], undefined, tokens, issues);

  // A sub-value is valid when it is a literal of the expected type or an alias to a token of it.
  const part = (value, expected) => {
    const alias = typeof value === 'string' ? ALIAS.exec(value) : null;
    if (alias === null) return VALUE_CHECKS[expected](value, part);
    return resolve(tokens, alias[1]).path !== undefined && typeOf(tokens, alias[1]) === expected;
  };

  for (const [path, token] of tokens) {
    const alias = typeof token.value === 'string' ? ALIAS.exec(token.value) : null;
    if (alias !== null) {
      const resolved = resolve(tokens, path);
      if (resolved.issue === 'alias cycle') {
        issues.push(`${path}: alias cycle`);
        continue;
      }
      if (!tokens.has(alias[1]) || resolved.path === undefined) {
        issues.push(`${path}: alias ${token.value} does not resolve`);
        continue;
      }
      const target = typeOf(tokens, alias[1]);
      if (token.type !== undefined && target !== undefined && target !== token.type) {
        issues.push(`${path}: alias ${token.value} is a ${target}, not a ${token.type}`);
      }
      continue;
    }
    if (token.type === undefined) {
      issues.push(`${path}: no $type on the token or a parent group`);
      continue;
    }
    if (!TYPES.has(token.type)) continue;
    if (!VALUE_CHECKS[token.type](token.value, part)) {
      issues.push(`${path}: invalid ${token.type} ${JSON.stringify(token.value)}`);
    }
  }
  return issues;
};

const tokenPaths = (node, path = []) =>
  !isObject(node)
    ? []
    : '$value' in node
      ? [path.join('.')]
      : Object.entries(node)
          .filter(([key]) => !key.startsWith('$'))
          .flatMap(([key, child]) => tokenPaths(child, [...path, key]));

/**
 * Compares the token paths of the two themes; every token needs a value in both.
 *
 * @param {{ light: unknown, dark: unknown }} themes
 * @returns {string[]}
 */
export const themeParity = ({ light, dark }) => {
  const lightPaths = new Set(tokenPaths(light));
  const darkPaths = new Set(tokenPaths(dark));
  return [
    ...[...lightPaths]
      .filter((path) => !darkPaths.has(path))
      .map((path) => `${path}: missing in the dark theme`),
    ...[...darkPaths]
      .filter((path) => !lightPaths.has(path))
      .map((path) => `${path}: missing in the light theme`),
  ];
};
