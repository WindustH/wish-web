#!/usr/bin/env node
// Execute (not just parse) every DOM-free core module: a broken export list
// (identifier removed but still referenced) only fails at evaluation time —
// node --check and static import scans cannot see it.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../webroot/app/core');
const mods = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.js')) mods.push(p);
  }
})(root);

const failed = [];
await Promise.all(mods.map(async (m) => {
  try { await import(pathToFileURL(m).href); }
  catch (err) { failed.push(`${m.replace(root + '/', '')}: ${err.message}`); }
}));
if (failed.length) {
  console.error('CORE MODULE EXECUTION FAILURES:\n' + failed.join('\n'));
  process.exit(1);
}
console.log(`check-core: ${mods.length} modules import+evaluate cleanly`);
