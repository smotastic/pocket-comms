// The port structure check (ADR 0003, ADR 0006). `.dependency-cruiser.cjs` checks which
// file imports which; this check reads what port and adapter files declare, with the types that
// the TypeScript compiler computes. Run it with `pnpm ports:check [--root <dir>]`.
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { layerLevel } = require('../boundaries/layer-paths.cjs');

const repoRoot = join(import.meta.dirname, '..', '..');
const APPLICATION_LEVEL = new RegExp(layerLevel('application'));
const INFRASTRUCTURE_LEVEL = new RegExp(layerLevel('infrastructure'));
const LAYER_NAME = /^layer(?:[A-Z][A-Za-z0-9]*)?$/;
const SEARCHED = ['packages', 'blueprints'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist']);
// The design system is frontend code without ports or layers (ADR 0009); its React and CSS imports
// are not for this compiler setup to resolve.
const SKIPPED_PATHS = new Set(['packages/design']);

// The same test code that `tsconfig.lib.json` excludes.
const isTestCode = (path) => /\.(?:spec|test)\.ts$/.test(path) || path.includes('/src/testing/');

// A web app's TanStack Router route tree (ADR 0011) is generated and imports `.tsx` route files,
// which this compiler setup does not resolve.
const isGenerated = (path) => path.endsWith('/src/routeTree.gen.ts');

const walk = (root, directory, files = []) => {
  if (!existsSync(join(root, directory))) return files;
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name) && !SKIPPED_PATHS.has(path)) walk(root, path, files);
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !isTestCode(path) &&
      !isGenerated(path)
    ) {
      files.push(path);
    }
  }
  return files;
};

// The service roots of `tools/boundaries/layer-paths.cjs`, with the service name captured.
const SERVICE_ROOT = /^(?:packages\/([^/]+)|blueprints\/([^/]+)\/packages)\//;

/** The service that owns a path: `packages/<service>/` or `blueprints/<service>/packages/`. */
const serviceOf = (path) => {
  const match = SERVICE_ROOT.exec(path);
  return match?.[1] ?? match?.[2];
};

/** The root folder of a service; a blueprint and a service of the same name are two services. */
const serviceRootOf = (path) => SERVICE_ROOT.exec(path)?.[0];

const PORT_FILE_NAME = /^.+\.(inbound|outbound)\.port\.ts$/;
const SUFFIX = { inbound: 'Inbound', outbound: 'Outbound' };

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A port file sits directly in `src/ports/` of an application layer. */
const isPortFile = (path) => {
  const level = APPLICATION_LEVEL.exec(path);
  return level !== null && /^src\/ports\/[^/]+$/.test(path.slice(level[0].length));
};

const looksLikePort = (path) => path.includes('/ports/') || path.endsWith('.port.ts');

// A symbol counts as an Effect symbol only when it is declared in the `effect` package, so a local
// class or an alias of the same name does not pass.
const resolveAlias = (checker, symbol) =>
  symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

const isTypeOnlyExport = (symbol) =>
  (symbol.declarations ?? []).some(
    (declaration) =>
      (ts.isExportSpecifier(declaration) &&
        (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly)) ||
      (ts.isNamespaceExport(declaration) && declaration.parent.isTypeOnly),
  );

const isEffectSymbol = (checker, symbol, module, name) => {
  const resolved = resolveAlias(checker, symbol);
  return (
    resolved?.name === name &&
    (resolved.declarations ?? []).some((declaration) => {
      const file = declaration.getSourceFile().fileName;
      return file.includes('/node_modules/effect/') && basename(file) === `${module}.d.ts`;
    })
  );
};

/**
 * The key literal of a class declared as `class X extends Context.Service<…>()('<key>')`, or
 * `undefined` when the class is not a `Context.Service`.
 */
const serviceKey = (checker, node) => {
  if (!ts.isClassDeclaration(node) && !ts.isClassExpression(node)) return undefined;
  const heritage = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const outer = heritage?.types[0]?.expression;
  if (!outer || !ts.isCallExpression(outer) || !ts.isCallExpression(outer.expression)) {
    return undefined;
  }
  const callee = outer.expression.expression;
  const name = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
  if (!isEffectSymbol(checker, checker.getSymbolAtLocation(name), 'Context', 'Service')) {
    return undefined;
  }
  return { key: outer.arguments[0] };
};

/**
 * Every module name that a file imports: import and export declarations, `import x = require()`,
 * `import('…')` types and dynamic `import()` calls.
 */
const moduleSpecifiers = (file) => {
  const specifiers = [];
  const visit = (node) => {
    const specifier =
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
        ? node.moduleSpecifier
        : ts.isExternalModuleReference(node)
          ? node.expression
          : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
            ? node.argument.literal
            : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
              ? node.arguments[0]
              : undefined;
    if (specifier && ts.isStringLiteralLike(specifier)) specifiers.push(specifier);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return specifiers;
};

/**
 * The output services of a `Layer` type, or `undefined` when the type is not a `Layer`. A union
 * such as `Layer<A> | Layer<B, E>` counts as a `Layer` with the outputs of all its layers.
 */
const layerOutput = (checker, type) => {
  if (type.isUnion() && !type.aliasSymbol) {
    const outputs = type.types.map((member) => layerOutput(checker, member)).filter(Boolean);
    return outputs.length > 0 ? outputs.flat() : undefined;
  }
  const symbol = type.aliasSymbol ?? type.getSymbol();
  if (!isEffectSymbol(checker, symbol, 'Layer', 'Layer')) return undefined;
  const output = (type.aliasSymbol ? type.aliasTypeArguments : checker.getTypeArguments(type))?.[0];
  if (!output || output.flags & ts.TypeFlags.Never) return [];
  return output.isUnion() ? output.types : [output];
};

/**
 * The output services of a `Layer` or of a function that returns one (a layer factory such as
 * `layer(limit)`), or `undefined` when the type is neither.
 */
const layerServices = (checker, type) => {
  const direct = layerOutput(checker, type);
  if (direct) return direct;
  const returned = type
    .getCallSignatures()
    .map((signature) => layerOutput(checker, signature.getReturnType()))
    .filter(Boolean);
  return returned.length > 0 ? returned.flat() : undefined;
};

/**
 * The static members of a class, inherited ones included, from the type of its constructor: one
 * entry per name, so overloads count once, and the type of a method is its function type. The
 * statics that `Context.Service` brings from the `effect` package are not members of the class.
 */
const staticMembers = (checker, constructorType) =>
  checker
    .getPropertiesOfType(constructorType)
    .filter(
      (symbol) =>
        symbol.name !== 'prototype' &&
        (symbol.declarations ?? []).length > 0 &&
        symbol.declarations.every(
          (declaration) => !declaration.getSourceFile().fileName.includes('/node_modules/'),
        ),
    )
    .map((symbol) => ({
      name: symbol.name,
      member: symbol.declarations[0],
      type: checker.getTypeOfSymbol(symbol),
    }));

/** A `Layer`, a layer factory, or `any` (a value or a function result), which could hold either. */
const mayBeLayer = (checker, type) =>
  Boolean(
    type.flags & ts.TypeFlags.Any ||
    type
      .getCallSignatures()
      .some((signature) => signature.getReturnType().flags & ts.TypeFlags.Any) ||
    layerServices(checker, type),
  );

const compilerOptions = () => {
  const base = ts.readConfigFile(join(repoRoot, 'tsconfig.base.json'), ts.sys.readFile);
  const { options, errors } = ts.convertCompilerOptionsFromJson(
    { ...base.config.compilerOptions, noEmit: true, composite: false, types: ['node'] },
    repoRoot,
  );
  if (errors.length > 0) {
    throw new Error(ts.flattenDiagnosticMessageText(errors[0].messageText, '\n'));
  }
  return options;
};

/**
 * Checks the port and adapter files below `root` and returns every violation, sorted, with the
 * counts that show what the run saw.
 */
export const checkPorts = ({ root = repoRoot } = {}) => {
  const violations = [];
  const report = (path, node, symbol, rule, message) => {
    const line = node
      ? node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line
      : 0;
    violations.push({
      file: path,
      line: line + 1,
      symbol,
      rule,
      message,
      service: serviceOf(path),
    });
  };

  // Every TypeScript file counts for the placement rule; only the sources are compiled.
  const allFiles = SEARCHED.flatMap((directory) => walk(root, directory));
  const files = allFiles.filter((path) => path.includes('/src/'));
  const portFiles = files.filter(isPortFile);

  for (const path of allFiles) {
    if (looksLikePort(path) && !isPortFile(path)) {
      report(
        path,
        undefined,
        '-',
        'port-outside-application',
        'a port file belongs directly in src/ports/ of an application layer',
      );
    }
  }

  const stats = { portFiles: portFiles.length, ports: 0, adapterLayers: 0 };
  if (portFiles.length === 0) {
    report(root, undefined, '-', 'no-ports', 'no port file found; the check would check nothing');
    return { violations, stats };
  }

  const program = ts.createProgram({
    rootNames: files.map((path) => join(root, path)),
    options: compilerOptions(),
  });
  const checker = program.getTypeChecker();
  const sourceFile = (path) => program.getSourceFile(join(root, path));

  // A missing module turns every type that comes from it into an error type, and a check on error
  // types passes for the wrong reason.
  for (const path of files) {
    for (const specifier of moduleSpecifiers(sourceFile(path))) {
      if (!checker.getSymbolAtLocation(specifier)) {
        report(path, specifier, specifier.text, 'unresolved-import', 'the import does not resolve');
      }
    }
  }

  const ports = [];
  for (const path of portFiles) {
    const file = sourceFile(path);
    const direction = PORT_FILE_NAME.exec(basename(path))?.[1];
    if (!direction) {
      report(
        path,
        undefined,
        '-',
        'port-file-name',
        'a port file is named <resource>.inbound.port.ts or <resource>.outbound.port.ts',
      );
    }

    // Type-only exports are allowed next to the port classes: types have no value declaration,
    // and an `export type` of a value exports only its type.
    const moduleSymbol = checker.getSymbolAtLocation(file);
    for (const exported of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) {
      if (isTypeOnlyExport(exported)) continue;
      const target = resolveAlias(checker, exported);
      const declaration = target.valueDeclaration;
      if (!declaration) continue;
      if (declaration.getSourceFile() === file && serviceKey(checker, declaration)) continue;
      report(
        path,
        exported.declarations?.[0] ?? declaration,
        exported.name,
        'port-file-export',
        'a port file exports only Context.Service ports and types',
      );
    }

    let inboundPorts = 0;
    for (const statement of file.statements) {
      const service = serviceKey(checker, statement);
      if (!service) continue;
      const name = statement.name?.text ?? 'default';
      const port = { path, node: statement, name, direction, service: serviceOf(path) };
      ports.push(port);
      // One inbound port per resource (ADR 0006), and the file name names the resource.
      if (direction === 'inbound' && ++inboundPorts > 1) {
        report(
          path,
          statement,
          name,
          'one-inbound-port-per-file',
          'an inbound port file declares one inbound port (ADR 0006)',
        );
      }
      if (direction && !name.endsWith(SUFFIX[direction])) {
        report(
          path,
          statement,
          name,
          'port-direction-suffix',
          `a port in a .${direction}.port.ts file ends in ${SUFFIX[direction]}`,
        );
      }
      const expected = new RegExp(
        `^${escape(port.service)}(?:/[^/]+)*/application/${escape(name)}$`,
      );
      if (!service.key || !ts.isStringLiteral(service.key) || !expected.test(service.key.text)) {
        report(
          path,
          service.key ?? statement,
          name,
          'port-service-key',
          `the service key is the string literal '${port.service}[/<path>]/application/${name}'`,
        );
      }
    }
  }
  stats.ports = ports.length;

  const portOf = new Map(ports.map((port) => [port.node, port]));
  /** The ports among the services of a layer output. */
  const portsIn = (services) =>
    services.flatMap((service) =>
      (service.getSymbol()?.declarations ?? []).flatMap((node) => portOf.get(node) ?? []),
    );

  for (const port of ports) {
    const statics = staticMembers(
      checker,
      checker.getTypeOfSymbol(checker.getSymbolAtLocation(port.node.name)),
    );
    if (port.direction === 'inbound') {
      // The use case layer is a `Layer` value, which the composition root merges as it is.
      const useCase = statics.find(({ name }) => name === 'layer');
      const services = useCase && layerOutput(checker, useCase.type);
      if (!services || !portsIn(services).includes(port)) {
        report(
          port.path,
          useCase?.member ?? port.node,
          port.name,
          'inbound-without-layer',
          `an inbound port has a static \`layer\` that provides ${port.name} (its use cases)`,
        );
      }
    }
    if (port.direction === 'outbound') {
      for (const { name, member } of statics.filter(({ type }) => mayBeLayer(checker, type))) {
        report(
          port.path,
          member,
          `${port.name}.${name}`,
          'outbound-static-layer',
          'an outbound port has no static layer; its adapters live in infrastructure',
        );
      }
    }
  }

  const adapterLayers = new Map();
  const untyped = new Set();
  const staticChecked = new Set();
  for (const path of files.filter((file) => INFRASTRUCTURE_LEVEL.test(file))) {
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile(path));
    for (const exported of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) {
      if (isTypeOnlyExport(exported)) continue;
      const target = resolveAlias(checker, exported);
      const declaration = target.valueDeclaration;
      // Types and namespace re-exports; the files behind a namespace are checked themselves.
      if (!declaration || target.flags & ts.SymbolFlags.ValueModule) continue;
      const declaredIn = relative(root, declaration.getSourceFile().fileName);
      // A class of this infrastructure layer, declared or as a class expression; a re-exported port
      // class is not one. A class type is one with construct signatures.
      const type = checker.getTypeOfSymbol(target);
      const isClass =
        type.getConstructSignatures().length > 0 || ts.isClassDeclaration(declaration);
      if (isClass && INFRASTRUCTURE_LEVEL.test(declaredIn) && !staticChecked.has(declaration)) {
        staticChecked.add(declaration);
        for (const { name, member } of staticMembers(checker, type).filter(({ type: memberType }) =>
          mayBeLayer(checker, memberType),
        )) {
          report(
            relative(root, member.getSourceFile().fileName),
            member,
            `${target.name}.${name}`,
            'adapter-static-layer',
            'an infrastructure class has no static layer; adapter layers are module exports',
          );
        }
      }
      const untypedResult = type
        .getCallSignatures()
        .some((signature) => signature.getReturnType().flags & ts.TypeFlags.Any);
      if (type.flags & ts.TypeFlags.Any || untypedResult) {
        if (!untyped.has(declaration)) {
          untyped.add(declaration);
          report(
            declaredIn,
            declaration,
            target.name,
            'unresolved-type',
            'the export or its result has type any, so the check cannot tell whether it is a layer',
          );
        }
        continue;
      }
      const services = layerServices(checker, type);
      if (!services) continue;
      if (!LAYER_NAME.test(exported.name)) {
        report(
          path,
          exported.declarations?.[0] ?? declaration,
          exported.name,
          'adapter-layer-name',
          'an adapter layer is named layer or layer<Tech>',
        );
      }
      if (adapterLayers.has(declaration)) continue;
      const provided = portsIn(services);
      adapterLayers.set(declaration, provided);
      // A layer with the output `never` is a background layer, such as an outbox relay.
      if (services.length > 0 && !provided.some((port) => port.direction === 'outbound')) {
        report(
          declaredIn,
          declaration,
          target.name,
          'adapter-provides-no-port',
          'an adapter layer provides at least one outbound port',
        );
      }
      for (const port of provided.filter(({ direction }) => direction === 'inbound')) {
        report(
          declaredIn,
          declaration,
          target.name,
          'adapter-provides-inbound',
          `an adapter layer does not provide the inbound port ${port.name}; its use cases are ${port.name}.layer`,
        );
      }
    }
  }
  stats.adapterLayers = adapterLayers.size;

  // Only a layer declared in an infrastructure layer of the port's own service counts, at any of
  // its levels; a re-export of a layer from elsewhere is no adapter.
  const covered = new Set();
  for (const [declaration, provided] of adapterLayers) {
    const declaredIn = relative(root, declaration.getSourceFile().fileName);
    if (!INFRASTRUCTURE_LEVEL.test(declaredIn) || isTestCode(declaredIn)) continue;
    for (const port of provided) {
      if (serviceRootOf(port.path) === serviceRootOf(declaredIn)) covered.add(port);
    }
  }
  for (const port of ports.filter((candidate) => candidate.direction === 'outbound')) {
    if (!covered.has(port)) {
      report(
        port.path,
        port.node,
        port.name,
        'outbound-without-adapter',
        `no infrastructure layer of ${port.service} provides ${port.name}`,
      );
    }
  }

  // Classes at any depth: in namespaces, in functions, and class expressions, which take the name
  // of their variable.
  for (const path of files.filter((file) => !isPortFile(file))) {
    const visit = (node) => {
      const name =
        node.name?.text ??
        (ts.isClassExpression(node) && ts.isVariableDeclaration(node.parent)
          ? node.parent.name.getText()
          : undefined);
      if (/(?:Inbound|Outbound)$/.test(name ?? '') && serviceKey(checker, node)) {
        report(
          path,
          node,
          name,
          'port-class-outside-ports',
          'a service named …Inbound or …Outbound is a port and belongs in a port file',
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile(path));
  }

  const ordered = violations.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule),
  );
  return { violations: ordered, stats };
};

const main = () => {
  const { values } = parseArgs({ options: { root: { type: 'string' } } });
  const root = values.root ?? repoRoot;
  const { violations, stats } = checkPorts({ root });
  for (const { file, line, symbol, rule, message } of violations) {
    console.log(`${file}:${line} ${symbol} [${rule}] ${message}`);
  }
  if (violations.length > 0) {
    console.log(
      `✖ ${violations.length} port structure violation(s) below ${relative(repoRoot, root) || '.'}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `✔ port structure check passed: ${stats.portFiles} port files, ${stats.ports} ports, ${stats.adapterLayers} adapter layers`,
  );
};

if (import.meta.main) main();
