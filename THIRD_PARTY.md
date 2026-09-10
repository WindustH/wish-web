# Third-party packages

Dependencies are installed locally through `./pnpmw` and pinned in
`package.json` and `pnpm-lock.yaml`. Vite bundles the modules actually used
into `dist/`; the deployed client does not fetch libraries from a CDN.

| Package | Version | Purpose | License |
| --- | --- | --- | --- |
| @fontsource-variable/noto-sans-sc | 5.3.0 | Local variable interface and body font | OFL-1.1 |
| @fontsource-variable/noto-serif-sc | 5.3.0 | Local variable display and heading font | OFL-1.1 |
| vue | 3.5.42 | Components and reactivity | MIT |
| vue-router | 4.6.4 | Routing and lazy pages | MIT |
| reka-ui | 2.10.4 | Accessible interaction primitives | MIT |
| @tanstack/vue-virtual | 3.13.37 | Dynamic list virtualization | MIT |
| @lucide/vue | 1.43.0 | Icons, imported by name | ISC |
| markdown-it | 15.0.1 | Markdown parsing | MIT |
| dompurify | 3.4.15 | HTML sanitization | MPL-2.0 OR Apache-2.0 |
| fast-json-patch | 3.1.1 | Ordered configuration draft operations | MIT |
| workbox-window | 7.4.1 | Service worker registration and update flow | MIT |
| vite | 8.2.2 | Development server and bundling | MIT |
| vite-plugin-pwa | 1.3.0 | Static shell precache generation | MIT |

Package license files are distributed with the installed packages in
`node_modules`; the lockfile records transitive packages and integrity hashes.
Update packages with `./pnpmw`, then run type checking, build, and the external
Wish browser regressions before deploying the compiled output.

Official project documentation:
[Vue](https://vuejs.org/), [Vue Router](https://router.vuejs.org/),
[Reka UI](https://reka-ui.com/), [TanStack Virtual](https://tanstack.com/virtual),
[Lucide](https://lucide.dev/), [markdown-it](https://github.com/markdown-it/markdown-it),
[DOMPurify](https://github.com/cure53/DOMPurify),
[JSON Patch](https://github.com/Starcounter-Jack/JSON-Patch),
[Vite](https://vite.dev/), [Vite PWA](https://vite-pwa-org.netlify.app/).

The Noto font binaries are emitted as Unicode-range WOFF2 shards. Browsers
request only shards needed by visible text, from the same origin. The service
worker caches requested fonts, without precaching the complete Chinese font
families. Font license and copyright notices ship under `public/licenses/` and
`dist/licenses/`. See [Noto CJK](https://github.com/notofonts/noto-cjk) and
[Fontsource](https://fontsource.org/fonts/noto-sans-sc).
