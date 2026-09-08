# Project requirements

- Target the current coordinated backend contract. Do not keep old-daemon API
  fallbacks, legacy history scans, or speculative response-shape aliases.
- Avoid defensive scaffolding: do not swallow unexpected exceptions or replace
  failed reads with plausible empty/success states. Surface errors, fail broken
  invariants explicitly, and keep only recovery with a concrete purpose.
- Keep presentation in UI modules, device services in platform adapters, and
  reusable state/API logic in DOM-independent core modules. Centralize API URLs
  and configuration parameters; backend state remains authoritative.
- Put new regression coverage in the sibling `/home/windy/repo/wish-test`
  repository. Use isolated daemons and a local fake upstream for browser tests.
- Every test owns and cleans up its processes and sessions, including failure
  paths. For an explicitly required live-deployment test, track exact newly
  created session IDs, clean up only those IDs in `finally`, and report failures.
- Preserve session-scoped drafts and image uploads across asynchronous work;
  callbacks from a previous session must not modify the newly selected session.
- Coordinate backend contract changes with the backend owner. Do not simulate
  missing persistent functionality by silently scanning or caching all history.
