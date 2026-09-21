# Development

[Documentation](README.md)

The frontend uses the single `wish` HTTP backend, built by the sibling `wish-server` crate.
The browser talks only to `/api`; `serve.mjs` proxies it to `WISH_UPSTREAM`
(default `http://127.0.0.1:9780`). Old wishd/providerd routes and persisted formats are not supported.

```sh
./pnpmw install --frozen-lockfile
WISH_UPSTREAM=http://127.0.0.1:9780 ./pnpmw dev
./pnpmw typecheck
./pnpmw build
node --test tools/*.test.mjs
node tools/selftest-api.mjs http://127.0.0.1:8790
```

Backend process/API checks live in `../wish-test/tests/test_wish_server.py`; run `python3 -m unittest tests.test_wish_server -v` from wish-test. They use temporary databases and a local mock upstream, without Rust internal tests. `/selftest?auto=1` (hash route) runs read-only browser checks. Do not test against production sessions when mutation is unnecessary.
