# Getting started

[Documentation](README.md) · [中文](../zh/getting-started.md)

Wish Web is the browser client for `wishd` and `wish-providerd`. Run both daemons before using session or provider features. The browser reaches each daemon through a separate same-origin proxy; Wish Web does not store conversations itself.

## Build and run

Use Node.js 22.19.0 or newer and Corepack. From this repository:

```sh
./pnpmw install --frozen-lockfile
./pnpmw build
node serve.mjs
```

Open `http://127.0.0.1:8790`. Defaults are `wishd` on port 9780 and `wish-providerd` on port 9781. `./pnpmw` keeps dependencies and package-manager caches inside the checkout. The deployment only needs `dist/` and `serve.mjs`; it does not need `node_modules`.

For development, run `./pnpmw dev`. Vite proxies `/wishd-api` and `/providerd-api` to the local default daemon ports. Its development proxy does not read the production server's token/environment settings; configure `vite.config.ts` when a different development backend is required.

## First conversation

Open Settings → Providers, add a preset or custom provider, supply its credentials and save. Choose a model in the new-conversation toolbar and send a message. The new conversation's selected model becomes the backend default for future conversations. Changing a model inside an existing conversation affects that conversation only.

Desktop navigation keeps the session list beside the conversation. On mobile, the home page combines a composer and recent sessions; View all sessions opens the full list. Statistics and settings are available from the home menu. Browser language and theme preferences are local to that browser.

An unavailable daemon produces a request error. A missing session or unknown page redirects to a session entry page. See [Troubleshooting](troubleshooting.md) for connectivity and model failures.
