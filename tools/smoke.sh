#!/bin/bash
set -e
CHROME=/usr/bin/google-chrome-stable
PROFILE=$(mktemp -d)
PORT=${1:-9444}
"$CHROME" --headless=new --remote-debugging-port=$PORT --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check about:blank >/dev/null 2>&1 &
CPID=$!
trap 'kill $CPID 2>/dev/null || true; sleep 0.3; rm -rf "$PROFILE" 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl --noproxy '*' -sf -m 1 http://127.0.0.1:$PORT/json/version >/dev/null 2>&1 && break; sleep 0.3; done
timeout 45 env -u HTTP_PROXY -u http_proxy -u HTTPS_PROXY -u https_proxy -u ALL_PROXY -u all_proxy deno run --allow-net --allow-read /tmp/smoke.ts $PORT
