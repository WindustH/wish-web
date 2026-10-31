// PDF.js reads these resources on demand; generated builds keep third-party binaries out of source.
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export function pdfAssets(): Plugin {
  const root = resolve('node_modules/pdfjs-dist');
  const allowed = /^(cmaps|standard_fonts|wasm)\/[\w.-]+$/;
  return {
    name: 'wish-pdf-resources',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', async (request, response, next) => {
        const path = ((request.url || '').split('?')[0] ?? '').replace(/^\//, '');
        if (!allowed.test(path)) return next();
        try {
          const bytes = await readFile(resolve(root, path));
          response.setHeader(
            'Content-Type',
            path.endsWith('.wasm')
              ? 'application/wasm'
              : path.endsWith('.js')
                ? 'text/javascript'
                : 'application/octet-stream',
          );
          response.end(bytes);
        } catch {
          next();
        }
      });
    },
    async generateBundle() {
      for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
        for (const name of await readdir(resolve(root, directory))) {
          if (!/\.(bcmap|ttf|pfb|wasm|js)$/.test(name) && !name.startsWith('LICENSE')) continue;
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${directory}/${name}`,
            source: await readFile(resolve(root, directory, name)),
          });
        }
      }
    },
  };
}
