# Admissions V2 Version Source Evidence

Date: 2026-07-12

Base commit: `bae29a28d9657f288b3339062adb31285959c966`

This is working-tree evidence for task 1.1. It proves the requested source
version edits; it is not a production release attestation.

## Maintained Sources

| Source | Observed value | SHA-256 after edit |
|---|---|---|
| `apps/admissions/package.json` | `2.0.0` | `806e5b872232686f65b0bf9b2986591c307f5a656642ec4461b9e15874a77b03` |
| `bun.lock` admissions workspace | `2.0.0` | `8f5baddf680856aa454193baef3e788946ab24f417aa6559ab17b964da4ba761` |
| `backend/pyproject.toml` | `2.0.0` | `33d289454b5f10bb64e75d811e79a93c4e3d7d4d04a9f805f5a404654826163e` |
| `backend/config/settings/base.py` `APP_VERSION` | `2.0.0` | `a48dff89bf7062af996393b6e049613d25cc3602acbd79d305a76cc0434b6b75` |
| `backend/config/settings/base.py` OpenAPI version setting | `2.0.0` | same source checksum as above |
| root `.env.example` | `2.0.0` | `4d7ce53c762a61a742460564924ab7be7f02679cda7d6416528b74889d055e53` |
| `apps/admissions/.env.example` | `2.0.0` | `bc18866283a291790da5178d8085d8696b5b131aa91fea7cdc5ac433814ded5b` |

## Executable Checks

- `bun run type-check`: passed.
- `.venv/bin/python manage.py check --settings=config.settings.dev`: passed
  with no issues and one existing silenced check.
- Django runtime settings output: `APP_VERSION=2.0.0` and
  `OPENAPI_VERSION=2.0.0`.
- A temporary OpenAPI schema generated from the current backend reports
  `info.version=2.0.0` and 142 paths.
- `DJANGO_SETTINGS_MODULE=config.settings.test TESTING=1 .venv/bin/python -m
  pytest -q tests/unit/test_schema_baseline.py`: 6 passed.
- `git diff --check`: passed.

## Deliberate Boundaries

- The `/api/v1/` URL remains unchanged. Product version and API major are
  separate contracts.
- `backend/schema/openapi.v1.baseline.yaml` remains at its previously generated
  `1.0.0` value. Its README prohibits manual edits, and current generation also
  exposes pre-existing route/generator drift. GOV-05/API-02 and tasks 1.2/1.5
  own a proper candidate-generated baseline and V2 contract.
- Historical launch evidence was not rewritten.
- A clean `uv run` project build fails because setuptools package discovery is
  incomplete. That pre-existing release defect is REL-02 and task 1.7; the
  existing backend virtual environment was used for runtime checks.
