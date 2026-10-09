# Task 1.7 — Backend project installation / release metadata reproducible

**Spec:** `admissions-v2-canonical-rebuild`
**Requirements:** R2.8, R17.1 · **Finding:** REL-02
**Candidate commit:** `bae29a28d9657f288b3339062adb31285959c966`
**Captured:** 2026-07-15 (UTC)

## Finding (REL-02)

> The backend declares a setuptools project, but editable/project builds fail
> because multiple top-level packages are discovered without explicit package
> configuration (`backend/pyproject.toml`; `uv run` build output). Either
> configure the intended `apps`/`config` package discovery and exclude
> non-packages, or explicitly make the backend a non-installable application;
> the chosen release command must work reproducibly.

## Decision — non-package Django application

The backend is declared, documented, and treated as a **non-package Django
application**, not an installable Python distribution. R2.8 explicitly permits
this branch ("...**or explicitly declare a non-package workflow**; its supported
release command SHALL report version `2.0.0`").

### Why non-package (grounded in how the backend is actually deployed)

Every real build/run path installs dependencies from `requirements.txt` and runs
the source tree in place — nothing ever builds or `pip install`s the backend as a
package:

| Path | What it actually does |
|---|---|
| `backend/Dockerfile` (production image, container `mihas-web-1`) | `pip install -r requirements.txt`, `COPY . .`, then `uvicorn config.asgi:application` (also runs `apply_sql_migrations` on boot) |
| `.github/workflows/ci.yml` | `pip install -r requirements.txt` |
| `.github/workflows/backend-governance.yml` | `pip install -r requirements.txt` |

Supporting facts: core models are `managed = False` with additive SQL migrations
applied by `apply_sql_migrations` (an application, not a library); there are no
`console_scripts`/entry points and no external importer of `beanola-django-api`;
the runtime product version is read from `settings.APP_VERSION` (surfaced via the
`X-Backend-Version` header and `/api/v1/meta/platform/`), never from
`importlib.metadata`. Making the backend an installable wheel would invent a
distribution artifact nothing consumes, contradicting the real requirements-based
deploy. The honest, reality-aligned decision is therefore **non-package**.

## What changed

- **`backend/pyproject.toml`** — removed the misleading setuptools build
  contract (`[build-system]` with `build-backend = "setuptools.build_meta"`).
  The file no longer advertises a pip-installable distribution. `[project]`
  (including the drift-guarded `version = "2.0.0"`) is retained as **release
  metadata only**, with a documentation header explaining the non-package
  decision and the real release command. `[tool.pytest.ini_options]` and
  `[tool.ruff]` are unchanged. The `2.0.0` version was **not** changed.
- **`backend/apps/common/management/commands/app_version.py`** — new supported
  runtime version-output command. `python manage.py app_version` prints
  `settings.APP_VERSION` (`2.0.0`); `--verbose` adds the product name and the
  distinct `api_version: v1` label. It sets `requires_system_checks = []` so it
  reports the version reliably even in a minimal/clean environment. It is named
  `app_version` (not `version`) because Django's management utility special-cases
  the bare `version` subcommand to print the *framework* version, which would
  shadow a custom `version` command on the real CLI.
- **`backend/DEPLOY.md`** — new "Release model: non-package application" section
  documenting the requirements-based release and the runtime version surfaces.
- **`backend/tests/unit/test_backend_release_metadata.py`** — regression tests
  locking the packaging contract (no `[build-system]`, `[project].version ==
  2.0.0`, non-package documentation present) and the runtime version output
  (`app_version` reports `settings.APP_VERSION`, `2.0.0` at HEAD, tracks the
  setting for any value, `--verbose` keeps `api_version` distinct).

## Reproduced before-failure (REL-02 on the old contract)

`uv build` on the pre-change `backend/pyproject.toml` (which declared
`build-backend = "setuptools.build_meta"`) fails exactly as REL-02 describes —
full log in [`raw/uv_build_before.txt`](raw/uv_build_before.txt):

```
error: Multiple top-level packages discovered in a flat-layout: ['apps', 'config', 'schema'].
...
  ╰─▶ Call to `setuptools.build_meta.build_sdist` failed (exit status: 1)
EXIT_CODE=2
```

## After — supported release command works reproducibly, reports 2.0.0

Fresh, isolated virtualenv on **Python 3.12.13** (matching the Docker base image
`python:3.12-slim` and CI's `python-version: '3.12'`), requirements-based install,
runtime version output — full logs in
[`raw/clean_venv_install.txt`](raw/clean_venv_install.txt) and
[`raw/clean_venv_runtime_version.txt`](raw/clean_venv_runtime_version.txt):

```
$ uv venv --python 3.12 /tmp/rel02_clean_venv        # Using CPython 3.12.13
$ uv pip install -r requirements.txt                 # succeeds (all deps resolved)

$ python manage.py app_version
2.0.0

$ python manage.py app_version --verbose
product: Beanola Admissions Platform
product_version: 2.0.0
api_version: v1

$ python -c "...; print('APP_VERSION =', settings.APP_VERSION)"
APP_VERSION = 2.0.0
```

The `X-Backend-Version` HTTP header is set from this same `settings.APP_VERSION`
(`apps/common/middleware.py`), so it reports `2.0.0` as well.

### `uv build` after the change (unsupported by design)

`uv build`/`pip install .` remain unsupported for this non-package application.
After removing the build contract, `uv build` no longer runs a *declared*
setuptools backend — uv falls back to the PEP 517 default
`setuptools.build_meta:__legacy__` (note the `:__legacy__` suffix versus the
before log) — see [`raw/uv_build_after.txt`](raw/uv_build_after.txt). This is
the correct behavior for a project that no longer claims to be pip-installable:
the supported release command is `pip install -r requirements.txt`, proven above.

## No version drift introduced (task 1.2 guard re-run)

Full output in
[`raw/version_drift_guard_rerun.txt`](raw/version_drift_guard_rerun.txt):

```
$ pytest tests/unit/test_version_drift_guard.py -q
11 passed

$ python scripts/generate_version_manifest.py --check-only
version-drift status: passed
labels: {'product': '2.0.0', 'api_major': 'v1', 'target_schema': 'v2'}
OK — all maintained product-version sources equal 2.0.0; api-major and target-schema labels distinct.
```

The drift guard reads `[project].version` via `tomllib` and only compares
`(name, classification, value)`, so removing `[build-system]` does not perturb
it; the committed `docs/v2-evidence/1.2/version-manifest.json` still matches the
live sources on value (`test_generated_manifest_matches_live_sources` passes).

## New regression tests

Full output in [`raw/release_metadata_tests.txt`](raw/release_metadata_tests.txt):

```
$ pytest tests/unit/test_backend_release_metadata.py -q
10 passed
```

## Verification commands

```bash
cd backend
# before (on the pre-change pyproject): reproduced REL-02
uv build --out-dir /tmp/rel02_build_repro            # fails: multiple top-level packages

# after: clean-environment requirements-based release + runtime version
uv venv --python 3.12 /tmp/rel02_clean_venv
uv pip install --python /tmp/rel02_clean_venv/bin/python -r requirements.txt
DJANGO_SETTINGS_MODULE=config.settings.test /tmp/rel02_clean_venv/bin/python manage.py app_version   # 2.0.0

# no drift + regression tests
pytest tests/unit/test_version_drift_guard.py tests/unit/test_backend_release_metadata.py -q
python scripts/generate_version_manifest.py --check-only
```

## Scope / deferral note

The strongest reproducible clean environment available here is a fresh Python
3.12 virtualenv with `pip install -r requirements.txt` — the same Python version
and the same install command the production `Dockerfile` uses. A full
container-image build (`docker build backend/`) was not executed in this
environment; that container-only portion is deferred to the deploy pipeline,
which already runs the identical `pip install -r requirements.txt` step proven
here. No required test was skipped or environment-gated.

## Evidence artifacts

| File | Contents |
|---|---|
| [`raw/uv_build_before.txt`](raw/uv_build_before.txt) | Reproduced REL-02 failure on the old setuptools contract (before) |
| [`raw/uv_build_after.txt`](raw/uv_build_after.txt) | `uv build` after removing the build contract (unsupported by design) |
| [`raw/clean_venv_install.txt`](raw/clean_venv_install.txt) | Fresh Python 3.12 venv + `pip install -r requirements.txt` (after) |
| [`raw/clean_venv_runtime_version.txt`](raw/clean_venv_runtime_version.txt) | Clean-environment runtime `2.0.0` output |
| [`raw/version_drift_guard_rerun.txt`](raw/version_drift_guard_rerun.txt) | Task 1.2 drift guard re-run (passed, no drift) |
| [`raw/release_metadata_tests.txt`](raw/release_metadata_tests.txt) | New regression test run (10 passed) |
