#!/usr/bin/env python3
"""Regenerate the frontend OpenAPI schema mirror fixture for Property 27.

Feature: beanola-production-readiness, Property 27: Frontend service shapes
match the backend contract.

The frontend contract drift guard
(``apps/admissions/tests/unit/openApiContractDriftGuard.test.ts``) runs under
Vitest/jsdom where no YAML parser is bundled. Rather than parse a 0.5 MB YAML
schema at test time, we commit a small TypeScript mirror that captures the two
facts the guard asserts:

  * the set of ``/api/v1/...`` route templates the schema exposes, and
  * every paginated ``*Page`` schema's property set.

Usage::

    cd backend
    DJANGO_SETTINGS_MODULE=config.settings.test \\
        python3 manage.py spectacular --format openapi-json --file /tmp/openapi.json
    python3 scripts/generate_openapi_fixture.py            # reads /tmp/openapi.json
    # or point at a specific schema file:
    python3 scripts/generate_openapi_fixture.py /path/to/openapi.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_DEFAULT_SCHEMA = Path("/tmp/openapi.json")
_FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "apps"
    / "admissions"
    / "tests"
    / "unit"
    / "__fixtures__"
    / "openApiSchemaMirror.ts"
)

_HEADER = """/**
 * Backend OpenAPI schema mirror — generated fixture for the contract drift guard.
 *
 * Feature: beanola-production-readiness, Property 27: Frontend service shapes match the backend contract
 *
 * DO NOT EDIT BY HAND. Regenerate after backend API changes with:
 *   cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \\
 *     python3 manage.py spectacular --format openapi-json --file /tmp/openapi.json
 *   python3 backend/scripts/generate_openapi_fixture.py   # writes this file
 *
 * It captures the two facts the frontend half of Property 27 asserts:
 *  - the set of `/api/v1/...` route templates the schema exposes (route presence), and
 *  - every paginated `*Page` schema's property set (envelope/pagination shape).
 */
"""


def _render(schema: dict) -> str:
    paths = sorted(schema.get("paths", {}).keys())
    comps = schema.get("components", {}).get("schemas", {})
    page_shapes = {
        name: sorted((defn.get("properties") or {}).keys())
        for name, defn in comps.items()
        if name.endswith("Page")
    }
    title = schema.get("info", {}).get("title")

    lines = [_HEADER]
    lines.append(f"export const OPENAPI_SCHEMA_TITLE = {json.dumps(title)} as const\n")
    lines.append("export const OPENAPI_PATHS: readonly string[] = [")
    lines.extend(f"  {json.dumps(p)}," for p in paths)
    lines.append("] as const\n")
    lines.append(
        "export const OPENAPI_PAGE_SCHEMAS: Readonly<Record<string, readonly string[]>> = {"
    )
    for name in sorted(page_shapes):
        arr = ", ".join(json.dumps(k) for k in page_shapes[name])
        lines.append(f"  {json.dumps(name)}: [{arr}],")
    lines.append("} as const\n")
    return "\n".join(lines)


def main() -> int:
    schema_path = Path(sys.argv[1]) if len(sys.argv) > 1 else _DEFAULT_SCHEMA
    if not schema_path.exists():
        print(f"schema not found: {schema_path}", file=sys.stderr)
        print(
            "generate it first with `manage.py spectacular --format openapi-json`",
            file=sys.stderr,
        )
        return 1

    schema = json.loads(schema_path.read_text())
    _FIXTURE.write_text(_render(schema))
    print(f"wrote {_FIXTURE} from {schema_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
