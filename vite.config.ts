import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// Short source revision, surfaced in the UI so "did this deploy reach me?"
// is answerable at a glance (info panel build row).
const buildId = (() => {
  try { return execSync('git rev-parse HEAD').toString().trim().slice(0, 12); }
  catch { return 'dev'; }
})();
// Unique for every build, including two deployments built from the same commit.
const webBuildId = `${buildId}-${Date.now().toString(36)}`;
import vue from '@vitejs/plugin-vue';
import pxtorem from 'postcss-pxtorem';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  cacheDir: '.cache/vite',
  // Adjust only the CJK faces, including Fontsource's generated shards.
  // Latin, monospace and math retain their own metrics.
  css: { postcss: { plugins: [{
    postcssPlugin: 'wish-cjk-metrics',
    AtRule: {
      'font-face': (rule) => {
        rule.walkDecls('font-family', (family) => {
          const name = family.value.replace(/["']/g, '');
          const scale = name === 'Sarasa Gothic SC' ? '95%'
            : name === 'Noto Serif SC Variable' ? '96%' : undefined;
          if (scale) rule.append({ prop: 'size-adjust', value: scale });
        });
      },
    },
  },
  // Font sizes are written in px and served in rem, so the text size setting scales them all.
  pxtorem({ rootValue: 16, propList: ['font', 'font-size', 'line-height', 'letter-spacing', '--message-size'], minPixelValue: 2 }),
  ] } },
  plugins: [
    // Kept out of Workbox's precache (which only includes HTML/CSS/JS/images).
    // Fetching this file therefore asks the live server even from an old tab.
    { name: 'wish-build-info',
      configureServer(server) {
        server.middlewares.use('/build-info.json', (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ id: webBuildId }));
        });
      },
      generateBundle() { this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({ id: webBuildId }) }); },
    },
    vue(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      includeAssets: ['manifest.webmanifest', 'app-icons/*.png'],
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/healthz$/],
        cleanupOutdatedCaches: true,
        // Fontsource splits CJK by unicode range. Cache only requested shards;
        // precaching the complete font families would download unused glyphs.
        runtimeCaching: [{
          urlPattern: /\/assets\/(?:noto-|sarasa-|maple-|STIXTwoMath-|montserrat-|bitter-).*\.woff2$/,
          handler: 'CacheFirst',
          options: { cacheName: 'wish-fonts', expiration: { maxEntries: 180, maxAgeSeconds: 31536000 } },
        }],
      },
    }),
  ],
  define: { __BUILD_ID__: JSON.stringify(buildId), __WEB_BUILD_ID__: JSON.stringify(webBuildId) },
  build: { target: 'es2022', manifest: true },
  server: {
    proxy: {
      '/api': { target: process.env.WISH_UPSTREAM || 'http://127.0.0.1:9780', headers: process.env.WISH_HTTP_TOKEN ? { Authorization: `Bearer ${process.env.WISH_HTTP_TOKEN}` } : {} },
    },
  },
});
