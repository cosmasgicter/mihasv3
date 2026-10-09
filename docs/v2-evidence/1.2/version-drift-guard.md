# Task 1.2 — Executable Version And API-Major Drift Guard

Spec: `admissions-v2-canonical-rebuild`
Requirements: **R2** (R2.1, R2.5, R2.7)
Findings: **REL-01**, **GOV-05**
Candidate commit (base): `bae29a28d9657f288b3339062adb31285959c966` (working tree)

This closes the guard that task 1.1 deferred — its note read
"consistency guard remains 1.2".

## What was added

| Artifact | Path | Role |
|---|---|---|
| Pure decision core | `scripts/launch-verification/version_eval.py` | I/O-free evaluator: maintained-source drift, API-major/target-schema distinctness (R2.5), immutable-historical labelling (R2.7). Mirrors the existing `launch-verification/*_eval.py` pattern. |
| Collector + manifest generator / CI check | `backend/scripts/generate_version_manifest.py` | Reads every real source, classifies it, feeds the pure core, writes the manifest, and exits non-zero on drift (`--check-only`). |
| Authoritative guard (executable, ungated) | `backend/tests/unit/test_version_drift_guard.py` | 11 pytest cases against the **live** sources + synthetic negative cases. Runs in the normal backend suite, no env gating (R1.4). |
| Property tests | `backend/tests/property/test_version_drift_properties.py` | Hypothesis properties over the pure core (pass-iff-no-drift, immutable-never-drifts, label-conflation detection). |
| Lightweight frontend mirror | `apps/admissions/tests/unit/versionDriftGuard.test.ts` | Vitest guard on the frontend product-version sources + label distinctness. |
| Generated version manifest (evidence) | `docs/v2-evidence/1.2/version-manifest.json` | Enumerates all 11 sources, values, SHA-256, and the evaluation verdict. |
| CI wiring | `.github/workflows/backend-governance.yml` | New "Version + API-major drift guard (R2, task 1.2)" step + version-source path triggers. Left the in-flight `ci.yml` untouched. |

## Sources checked (design.md §2 skill trace)

`source-code-context` traced every version source before writing the guard:

| Source | Classification | Value |
|---|---|---|
| `apps/admissions/package.json` | maintained_product | `2.0.0` |
| `bun.lock` (apps/admissions workspace) | maintained_product | `2.0.0` |
| `backend/pyproject.toml` `[project].version` | maintained_product | `2.0.0` |
| `settings.APP_VERSION` (runtime metadata / `X-Backend-Version`) | maintained_product | `2.0.0` |
| `SPECTACULAR_SETTINGS["VERSION"]` (generated OpenAPI product version) | maintained_product | `2.0.0` |
| root `.env.example` `VITE_APP_VERSION` | maintained_product | `2.0.0` |
| `apps/admissions/.env.example` `VITE_APP_VERSION` | maintained_product | `2.0.0` |
| `/api/v1/` URL prefix (`config/urls.py`) | api_major | `v1` |
| meta endpoint `api_version` (`/api/v1/meta/platform/`) | api_major | `v1` |
| target `/api/v2/` strict contract (design.md §4) | target_schema | `v2` |
| `backend/schema/openapi.v1.baseline.yaml` `info.version` | immutable_historical | `1.0.0` (allowed, labelled) |

The three release labels are asserted **pairwise distinct** — product `2.0.0`,
API major `v1`, target schema `v2` (R2.5). The frozen `1.0.0` V1 baseline is
**allowed** as labelled immutable historical launch evidence and is never
flagged as drift (R2.7).

## Executable results (this working tree)

- Backend guard: `pytest tests/unit/test_version_drift_guard.py -q` → **11 passed**.
- Property core: `pytest tests/property/test_version_drift_properties.py -q` → **3 passed**.
- Frontend mirror: `bun x vitest run tests/unit/versionDriftGuard.test.ts` → **4 passed**.
- CI check: `python3 scripts/generate_version_manifest.py --check-only` → exit `0`,
  `version-drift status: passed`.

## Negative proof (the guard fails on drift)

Two layers:

1. **Synthetic (permanent CI):** `test_guard_fails_when_a_maintained_source_drifts`,
   `test_guard_fails_when_api_major_relabelled_to_product`,
   `test_guard_fails_when_labels_are_conflated`,
   `test_guard_fails_on_unlabeled_immutable_evidence`, and
   `test_guard_fails_on_unknown_classification` drive the pure core with drifted
   facts and assert `passed is False` — no real file perturbed.

2. **Real-file perturbation (one-off):** `backend/pyproject.toml` `version` was
   temporarily changed `2.0.0` → `2.0.1`; the **live** guard failed as expected:

   ```
   AssertionError: version drift detected:
   [{'source': 'backend/pyproject.toml [project].version',
     'kind': 'product_drift', 'expected': '2.0.0', 'observed': '2.0.1'}]
   FAILED tests/unit/test_version_drift_guard.py::test_live_sources_pass_the_drift_guard
   FAILED tests/unit/test_version_drift_guard.py::test_every_maintained_source_reports_product_version
   ```

   The file was reverted to `2.0.0` (SHA-256 back to
   `33d289454b5f10bb64e75d811e79a93c4e3d7d4d04a9f805f5a404654826163e`, matching
   the task 1.1 evidence and the 0.5 baseline manifest); the full guard then
   returned **11 passed**.

## Deliberate boundaries

- The `/api/v1/` URL is **not** renamed — API major and product version stay
  distinct contracts (R2.5; consistent with task 1.1 and design.md §4).
- The frozen `openapi.v1.baseline.yaml` (`1.0.0`) is **not** rewritten; it is
  recognised as labelled immutable historical evidence (R2.7).
- No unrelated in-flight worktree changes were touched; `ci.yml` (already
  modified in the working tree) was left alone — the guard was wired into
  `backend-governance.yml` instead.
- The `tasks.md` checkbox is left for the orchestrator.

## Independent re-verification (2026-07-13)

The task 0.5 baseline flagged that tasks 1.2–1.5 landed partial work that was
never fully verified. This section records an independent end-to-end re-run of
the task 1.2 guard against the current working tree (HEAD
`bae29a28d9657f288b3339062adb31285959c966`, the same commit recorded in
`version-manifest.json`). All commands run without env gating or `skip` (R1.4).

| Check | Command | Result |
|---|---|---|
| Backend guard (authoritative, live sources + synthetic negatives) | `DJANGO_SETTINGS_MODULE=config.settings.test TESTING=1 .venv/bin/python -m pytest tests/unit/test_version_drift_guard.py -q` | **11 passed** |
| Property core (hypothesis, pure evaluator) | `DJANGO_SETTINGS_MODULE=config.settings.test TESTING=1 .venv/bin/python -m pytest tests/property/test_version_drift_properties.py -q` | **3 passed** |
| Frontend mirror | `bun x vitest run tests/unit/versionDriftGuard.test.ts` | **4 passed** |
| CLI drift check (CI hard gate) | `DJANGO_SETTINGS_MODULE=config.settings.test TESTING=1 .venv/bin/python scripts/generate_version_manifest.py --check-only` | exit `0`, `version-drift status: passed`, `labels {product: 2.0.0, api_major: v1, target_schema: v2}` |

Live-source confirmation (traced via `source-code-context` before re-running):

- `apps/admissions/package.json` `version` = `2.0.0`; `backend/pyproject.toml`
  `[project].version` = `2.0.0`.
- `backend/config/settings/base.py`: `APP_VERSION = os.environ.get("APP_VERSION", "2.0.0")`
  and `SPECTACULAR_SETTINGS["VERSION"] = "2.0.0"`.
- `backend/apps/common/meta_views.py`: runtime meta payload `"api_version": "v1"`
  (distinct from the product version).
- Root and `apps/admissions/` `.env.example`: `VITE_APP_VERSION=2.0.0`.
- `test_generated_manifest_matches_live_sources` passes, so the committed
  `version-manifest.json` still matches the live sources at this commit; its
  `commit_sha` equals current HEAD, so no regeneration was required.

CI wiring confirmed present in `.github/workflows/backend-governance.yml`
("Version + API-major drift guard (R2, task 1.2)" step running the guard test
plus `generate_version_manifest.py --check-only`, with version-source path
triggers). `ci.yml` was left untouched.

Outcome: the task 1.2 guard is fully functional and green end to end. No source
or test changes were required — the prior in-flight work is verified complete.
