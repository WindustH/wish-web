import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  cacheDir: '.cache/vite',
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
          urlPattern: /\/assets\/noto-.*\.woff2$/,
          handler: 'CacheFirst',
          options: { cacheName: 'wish-fonts', expiration: { maxEntries: 180, maxAgeSeconds: 31536000 } },
        }],
      },
    }),
  ],
  build: { target: 'es2022', manifest: true },
  server: {
    proxy: {
      '/wishd-api': { target: 'http://127.0.0.1:9780', rewrite: (path) => path.slice('/wishd-api'.length) },
      '/providerd-api': { target: 'http://127.0.0.1:9781', rewrite: (path) => path.slice('/providerd-api'.length) },
    },
  },
});
