import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// Short source revision, surfaced in the UI so "did this deploy reach me?"
// is answerable at a glance (info panel build row).
const buildId = (() => {
  try { return execSync('git rev-parse HEAD').toString().trim().slice(0, 12); }
  catch { return 'dev'; }
})();
import vue from '@vitejs/plugin-vue';
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
  }] } },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      includeAssets: ['manifest.webmanifest', 'app-icons/*.png'],
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallbackDenylist: [/^\/wishd-api(?:\/|$)/, /^\/providerd-api(?:\/|$)/, /^\/healthz$/],
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
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  build: { target: 'es2022', manifest: true },
  server: {
    proxy: {
      '/wishd-api': { target: 'http://127.0.0.1:9780', rewrite: (path) => path.slice('/wishd-api'.length) },
      '/providerd-api': { target: 'http://127.0.0.1:9781', rewrite: (path) => path.slice('/providerd-api'.length) },
    },
  },
});
