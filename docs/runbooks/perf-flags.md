# Performance Feature Flags

There are no performance cache flags any more. The system-performance-hardening spec added three flag-gated caches: `PERF_CACHE_CAPABILITIES` (the admin scope and capabilities endpoints), `PERF_CACHE_DASHBOARD` (the admin dashboard) and `PERF_CACHE_CATALOG` (the catalogue reads). Platform-simplification tasks 16.1 and 16.2 removed all three, with their flags, invalidation signals and the shared `scoped_cache` module (decision D7 option A, 2026-11-21). Setting those names now does nothing. Every one of those endpoints computes its response on each request, which is what every configured environment already did, because the flags defaulted to off.

## Why they were removed

- **No environment turned them on.** No production host exists to check (D14), so the check used the configuration the next server will be built from: `deploy/docker-compose.prod.yml`, `backend/config/settings/prod.py` and the tracked env templates. None of them sets any `PERF_CACHE_*` name, and neither do `staging.py`, `harness.py` or the harness compose file. `base.py` defaulted all three to off.
- **The catalogue cache had no material benefit.** It was measured on the local harness with the same 14-request mix with the cache on and off, in the order off, on, off, on, with 200 passes each after a warm-up. With the cache on, the median catalogue request was 6.2 to 6.4 ms faster (about 30%), and the mean was 9.3 to 9.6 ms faster (about 43%). The bar, written down before the run, was at least 25% and at least 10 ms at the median. A phone round trip of 100 to 300 ms dwarfs that saving.

## Production values

No P0_Ops_Check ever recorded a production value for these flags. Previously claimed, and never shown by anything in the repository: `PERF_CACHE_CATALOG` `true` since 2026-07-04 (Performance Gate closure), and `PERF_CACHE_DASHBOARD` `false`.

## If a cache is wanted again

Reintroducing one is a new decision. Measure first with the same request mix on the stack it is meant for, record the result, and enable it in the configuration production is built from. The removed code is in git history before the 16.1 and 16.2 commits.
