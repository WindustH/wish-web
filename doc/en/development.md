# Development and verification

[Documentation](README.md) · [中文](../zh/development.md)

## Repository workflow

Use the checked-in `./pnpmw` wrapper and frozen lockfile. Vue SFCs and TypeScript run in strict mode with unused locals/parameters checked. Some core modules remain JavaScript with `.d.ts` interfaces; update implementations and declarations together. Avoid introducing a second state store or backend compatibility branch for a coordinated contract change.

```sh
./pnpmw typecheck
./pnpmw build
```

The build creates `dist/`, a Vite asset manifest and PWA files. Keep `node_modules/`, `.cache/` and `dist/` untracked. Third-party licenses and bundled-font sources are listed in `THIRD_PARTY.md` and asset source manifests.

## Tests

Behavior tests live in the sibling `wish-test` repository. They use real Rust binaries, temporary configuration/data and a local fake upstream; paid-provider tests are explicit opt-in.

```sh
cd ../wish-test
python3 run_tests.py
python3 web/launch.py --check
bash web/run-scale.sh
```

For a focused browser scenario, build Wish/Web first, run `python3 web/launch.py 180`, then pass its printed local Web URL and an output directory to `node web/scenarios-missing-pages.mjs URL OUTPUT`. Other focused scripts in `web/` use the same pattern where documented. Touch the printed stop-file when finished; the launcher also cleans up on its deadline. Each test must clean up owned sessions/processes on failure as well as success.

Regression selection should cover the affected owner: API/proxy separation, config revision conflicts, stream retry/handoff, stale session callbacks, list virtualization, responsive navigation, focus/animation and chart ranges. Do not replace real backend behavior with a browser fixture when testing the contract itself.

## Adding functionality

Add endpoint behavior to the correct backend, expose only the Web calls needed, normalize data in core, and keep rendering in feature/shared UI modules. Prefer existing Reka UI focus/dialog behavior, TanStack virtualization and shared range/chart helpers. Cancel asynchronous reads on scope changes. Preserve session-scoped drafts and never redirect a new session because an old request failed.

Update both language guides and verify links/examples against source. Backend public APIs are documented in the Wish repository; Web documentation should explain ownership and user behavior without copying an entire API schema.
