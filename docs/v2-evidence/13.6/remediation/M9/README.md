# M9 — Admissions V2 canonical rebuild handoff

Measured on **2026-08-15 UTC** against `main` at
`bae29a28d9657f288b3339062adb31285959c966`, plus the inherited dirty worktree.

## Verdict

The M9-scoped local engineering candidate is green for the work completed here:
the full PostgreSQL backend suite, full frontend unit suite, lint, production
typecheck, production build, generated contract checks, governance validators, and the
scoped F1/F2/F3 browser rows pass. `GATE-13.2-03` is closed by three runs of the
exact stale, dirty wizard conflict/reload regression. M9 did not re-run every
complete required Playwright project, so it does not claim the broader zero-skip
browser matrix required to close GOV-04.

The **spec is not production-closed**. Its canonical status correctly remains
`planned`; tasks 6.3, 12.3, 12.5 and 13.6 remain partial, and 13.5 remains not
executed. No agent may substitute local tests for a canary, production data
decision, operator action, or human approval.

## What was inherited from the previous AI work

This was not a blank implementation. The inherited tree contained a broad V2
rebuild, 68 checked tasks, extensive evidence, an isolated two-tenant harness,
generated API types, migrations, authority registries, and thousands of tests.
The work was substantial, but its closeout state was not trustworthy yet:

1. The candidate was an uncommitted **1,018-path dirty worktree**, so results were
   not bound to a reproducible release object.
2. The first local PostgreSQL whole-tree run still had **21 failures** across
   stale V2 mocks, capability caching, schema generation, rollback policy, scope,
   view classification, public endpoint classification, and two stale authority/
   denial assertions.
3. Student draft answers could still bypass a canonical command path. The main
   writer had no required optimistic version token, no row lock, and no stable
   idempotent update contract.
4. The browser persistence path had queue/ref races: queued saves could use an
   old application id/version, and retry attempts could mint new idempotency keys.
5. Resume hydration could fall back from a failed authoritative record to a
   list projection and write blank or absent personal fields over live answers.
   A local timestamp heuristic also compared a PII-full form with a deliberately
   PII-stripped cache and could self-report a conflict.
6. The generated OpenAPI path did not explicitly require `expected_version` or
   expose the 409 `current_version` contract. Idempotency replay also failed for
   DRF values such as `Decimal`/UUID without DRF's JSON encoder.
7. The earlier F3 evidence proved APIRequestContext concurrency, not the original
   stale, dirty wizard reload regression. F1 also carried a test-lifetime
   `/api/v1/` failure allowance that could hide post-reconnect background errors.
8. Tasks 6.3, 12.3 and 12.5 were checked despite their own evidence describing
   unfinished state-machine, data-contraction, and legacy-register work.

The baseline and cause attribution are retained in `raw/01`–`04`; the clustering
instrument now has an honest reachable `UNCLUSTERED` fallback.

## M9 remediation

### Canonical backend write

- `PATCH /api/v1/applications/drafts/{id}/` now requires `Idempotency-Key` and
  `expected_version`, locks the row with `select_for_update`, increments exactly
  once, replays the original response for the same command, and returns
  `409 VERSION_CONFLICT` with `current_version` for a stale command.
- Generic student PUT/PATCH of an application is refused with
  `CANONICAL_DRAFT_UPDATE_REQUIRED`; the admin generic path remains available.
- Draft list/detail shapes publish the version token, and the idempotency store
  serializes DRF response values with the DRF JSON encoder.
- Error catalogs, OpenAPI request/response schemas, and generated TypeScript
  types now describe the same contract.

### Safe frontend persistence and resume

- Draft saves are serialized through one promise chain, read the current
  application id and server version at execution time, latch create id/version
  before the next command, and retain one idempotency key across retries.
- `VERSION_CONFLICT` is terminal: automatic retries stop, Save now is disabled,
  and the UI offers **Reload latest draft**.
- Selected-draft resume now fails closed when the authoritative record is missing
  or unavailable; a list projection cannot hydrate blank personal answers.
- The unsafe local timestamp arbitration was removed.

### Exact browser regression

The final F3 journey uses two independently authenticated browser contexts. The
second wizard is hydrated before the winner, then dirtied from its stale in-memory
version. Device 1 wins through the real **Save now** control; its exact request is
replayed with the captured stable key and returns the original body. Device 2's
**Save now** receives 409, visibly enters terminal conflict, and **Reload latest
draft** restores the winner. The stale value does not return and the draft does
not fork. This passed three independent final runs.

The journey also records a narrower residual: resume/step navigation may issue a
same-value projection write. It does not revert the winner, but it confirms the
multiple-owner debt and is why task 6.3 remains partial.

## Final verification

| Gate | Final result |
|---|---|
| Backend, local PostgreSQL 18, whole tree | **5,425 passed, 104 skipped, 2 xfailed, 1 xpassed**, exit 0 |
| Canonical draft PostgreSQL integration | **6 passed**, including a real two-thread one-winner/one-409 race |
| Frontend Vitest | **495 files passed, 1 skipped; 4,627 tests passed, 1 skipped**, exit 0 |
| Frontend lint / production typecheck | exit 0 / exit 0 |
| Production build | **3,426 modules**, HTML/CSP pass, exit 0 |
| M9-scoped F3 stale-dirty-wizard UI | **3/3 independent runs passed**, zero skips/unexpected/flaky |
| M9-scoped F1 offline + F2 refresh | **2/2 passed**, with no API-wide failure allowance |
| Harness drain / teardown | broker 0, unsettled payments 0, references `[]`; volumes removed; `ps` empty |
| OpenAPI generation | 0 errors, 0 warnings; schema/types hashes retained in `raw/11` |
| Spec governance | 0 errors, 0 warnings; **24/24** self-tests |
| Spec metadata | 0 errors, 2 unrelated warnings; **9/9** self-tests |

The backend moved from the retained 21-failure baseline to the final green run.
That is a test result for this dirty candidate, not a claim that 21 isolated code
edits map one-to-one to failures or that the worktree is immutable.

## Canonical task truth after reconciliation

| State | Tasks |
|---|---|
| Checked | 68 |
| Partial | 6.3, 12.3, 12.5, 13.6 |
| Not executed | 13.5 |

`validate_spec_governance.py` reports 18 requirements, 110 findings, 73 tasks,
and 68 checked tasks. `.config.kiro` stays `status: planned`.

## Remaining production/operator blockers

1. **Task 6.3:** consolidate `useAutoSave`, smart autosave, wizard persistence,
   session/cache, and offline recovery into the one state machine the task asks
   for; remove the observed same-value projection write after parity proof.
2. **Task 12.3:** an accountable finance/data owner must decide and execute the
   backfill-or-quarantine treatment for the 16 unbacked money rows, re-run the
   invariants on production, and only then perform the backup-first contraction
   and rollback procedure. DATA-10/DATA-11 are not closed by local code.
3. **Task 12.5:** two legacy registers owned by other specs still lack the
   per-entry owner/removal-date shape required by this task.
4. **Task 13.5:** decide the production hostname lineage (`*.beanola.com` versus
   `*.mihas.edu.zm`), take/verify backups, apply approved migrations, deploy the
   canary, exercise real email/phone and two-tab/device flows, monitor the +24h
   window, verify Redis/Celery/outbox drain, and make the hold/broaden/rollback
   decision across the remaining tenants.
5. **GOV-04 / task 13.6:** run every complete required Playwright project as a
   zero-skip matrix, then obtain the two independent human reviewer/operator
   approvals. The agent did not and must not fabricate those signatures.

No production system was contacted. No production or Neon write, migration,
deployment, commit, tag, push, PR, or signature was performed. The isolated
harness stack was destroyed with its volumes. The local PostgreSQL test server
used for verification is an ephemeral local process documented in the raw
transcripts.

## Evidence index

- `raw/01-baseline-backend-whole-tree.txt` — inherited whole-tree baseline
- `raw/02-baseline-clusters.txt` — reproducible cause clusters
- `raw/06-candidate-identity-and-diff.txt` — dirty candidate identity
- `raw/08-draft-concurrency-backend-postgres.txt` — focused PostgreSQL transcript
- `raw/10-f3-two-device-three-runs.txt` plus `raw/playwright-*.json` — retained UI reports
- `raw/12-harness-drain-teardown.txt` — final drain and destructive harness cleanup
- `raw/21-backend-whole-tree-after.txt` and `raw/22-whole-tree-delta.txt` — final backend result
- `raw/23-frontend-full-gates.txt` — final frontend runner summaries
- `raw/24-required-skip-audit.txt` — suppression/skip qualification
- `raw/25-governance-traceability.txt` — final governance commands
- `raw/26-docs-fingerprint-after.txt` — evidence immutability comparison
- `manifest.json` — artifact hashes and final disposition
