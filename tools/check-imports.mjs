#!/usr/bin/env node
// Static module-graph check: every RELATIVE import specifier in webroot/app
// must resolve to an existing file. node --check parses syntax only — a
// wrong '../../..' depth loads fine in isolation and 404s in the browser
// (blank-site incident, round-4). Bare specifiers are import-map territory
// (preact/htm — vendored, checked by the SW manifest build instead).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../webroot/app');
const errors = [];
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.js')) files.push(p);
  }
})(root);

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g;
const NAMED_IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
const exportOf = (src, name) =>
  new RegExp(`(?:export(?:\\s+async)?\\s+(?:function|const|let|class)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b|export\\s+default\\b)`).test(src);

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec.startsWith('.')) continue;          // bare: import map / vendor
    const target = resolve(dirname(file), spec);
    let ok = false;
    try {
      ok = statSync(target).isFile();
    } catch { ok = false; }
    if (!ok) { errors.push(`${file.replace(root + '/', '')} → ${spec} (missing file)`); continue; }
    // named imports must actually exist in the target (catches valid-path /
    // wrong-export mistakes like `import { Icon } from './button.js'`)
    const named = [...src.matchAll(NAMED_IMPORT_RE)]
      .filter((n) => resolve(dirname(file), n[2]) === target)
      .flatMap((n) => n[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean));
    const tsrc = readFileSync(target, 'utf8');
    for (const name of named) {
      if (!exportOf(tsrc, name)) errors.push(`${file.replace(root + '/', '')} imports { ${name} } from ${spec} — not exported`);
    }
  }
}
if (errors.length) {
  console.error('BROKEN IMPORTS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`check-imports: all relative imports resolve (${files.length} modules)`);
