// Serve the manifest's PNG URLs in development and emit the same assets into dist.
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const cli = createRequire(import.meta.url).resolve('@tauri-apps/cli/tauri.js');
const execute = promisify(execFile);

async function renderIcons() {
  const source = resolve('public/app-icons/icon.svg');
  const dir = await mkdtemp(join(tmpdir(), 'wish-app-icons-'));
  try {
    await execute(process.execPath, [cli, 'icon', source, '-p', '192', '-p', '512', '-o', dir]);
    const icons = new Map([
      ['app-icons/icon-192.png', await readFile(join(dir, '192x192.png'))],
      ['app-icons/icon-512.png', await readFile(join(dir, '512x512.png'))],
    ]);
    // Full bleed paper and a smaller central crane leave room for launcher masks.
    const artwork = await readFile(source, 'utf8');
    const maskable = join(dir, 'maskable.svg');
    await writeFile(
      maskable,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#f5f1e8"/><g transform="translate(40.96 38.96) scale(.84)">${artwork}</g></svg>`,
    );
    await execute(process.execPath, [cli, 'icon', maskable, '-p', '512', '-o', dir]);
    icons.set('app-icons/maskable-512.png', await readFile(join(dir, '512x512.png')));
    return icons;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function appIcons(): Plugin {
  return {
    name: 'wish-app-icons',
    async configureServer(server) {
      const icons = await renderIcons();
      server.middlewares.use((request, response, next) => {
        const bytes = icons.get((request.url ?? '').split('?')[0]!.slice(1));
        if (!bytes) return next();
        response.setHeader('Content-Type', 'image/png');
        response.end(bytes);
      });
    },
    async generateBundle() {
      for (const [fileName, source] of await renderIcons()) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}
