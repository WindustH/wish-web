// Enforce dependency direction using parsed imports, including dynamic imports and exports.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { parse } from 'vue/compiler-sfc';
const root = path.resolve('src');
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : /\.(ts|vue)$/.test(entry.name) ? [path.join(dir, entry.name)] : []))).flat();
}
const failures = [], features = new Map();
function layer(file) { return path.relative(root, file).split(path.sep); }
for (const file of await files(root)) {
  let source = await readFile(file, 'utf8');
  if (file.endsWith('.vue')) { const { descriptor } = parse(source); source = `${descriptor.script?.content ?? ''}\n${descriptor.scriptSetup?.content ?? ''}`; }
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
    if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
      const target = path.resolve(path.dirname(file), specifier.text), from = layer(file), to = layer(target);
      if ((from[0] === 'core' && ['ui', 'features'].includes(to[0])) || (from[0] === 'platform' && ['core', 'ui', 'features'].includes(to[0])) || (from[0] === 'ui' && to[0] === 'features') || (from[0] === 'features' && to.length === 1)) failures.push(`${from.join('/')} -> ${to.join('/')}`);
      if (from[0] === 'features' && to[0] === 'features' && from[1] !== to[1]) {
        if (!features.has(from[1])) features.set(from[1], new Set());
        features.get(from[1]).add(to[1]);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const done = new Set();
function walk(feature, stack = []) {
  if (stack.includes(feature)) { failures.push(`Feature cycle: ${[...stack.slice(stack.indexOf(feature)), feature].join(' -> ')}`); return; }
  if (done.has(feature)) return;
  for (const next of features.get(feature) ?? []) walk(next, [...stack, feature]);
  done.add(feature);
}
for (const feature of features.keys()) walk(feature);
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log('Import boundaries and feature dependency graph passed.');
