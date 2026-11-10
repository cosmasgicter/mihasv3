#!/usr/bin/env python3
"""V1 legacy-surface caller telemetry — the zero report task 12.2's evidence needs.

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task **12.2**
Requirements: **R2.5-R2.7** (compatibility windows / measured deprecation),
**R14.5** (permissive array/result/data normalizers and legacy request aliases
are DELETED after cutover, not retained indefinitely), **R14.7** (breaking
removals expose deprecation/usage telemetry until their exit criteria are met).
Findings: **API-02**, **API-04**, **REL-01**, **STU-23**.

Why this exists as a tool rather than a paragraph
-------------------------------------------------
The whole justification for deleting a compatibility normalizer or a duplicate
route is *"nothing first-party needs it"*. That is a **measurement**, and a
measurement read off by eye is not reproducible. Task 1.5 removed one normalizer
as the reference pattern and left the rest with telemetry; task 5.1 added
``X-Legacy-Catalog-Write`` and the ``catalog.legacy_write`` counter and said in
its own docstring that they exist for "the source/telemetry evidence to spot any
residual first-party caller". This is that evidence, produced by tooling.

What it measures
----------------
Three independent halves, each reported separately so a reader can see which
claim rests on which instrument:

1. ``--source`` — **source telemetry.** For every declared V1 legacy surface,
   grep the *production* frontend for a first-party caller, with the exact
   pattern recorded in the output. Matches are classified by the file that holds
   them: ``production`` (a real caller), ``test`` (a pin, not a caller),
   ``dev-preview`` (``src/pages/dev/**``, which steering explicitly permits),
   ``self`` (the definition itself, or a comment recording the retirement).
   A surface declared ``removed`` FAILS if it has any ``production`` caller.

2. ``--routes`` — **route telemetry.** Reconcile the approved authority-matrix
   registry against the LIVE Django URLConf: every registered path must be
   served, and every legacy route still served must be listed here with its
   disposition. Needs Django importable; degrades to ``not_measured`` rather
   than guessing.

3. ``--headers`` — **runtime deprecation signalling.** For every route kept for
   external compatibility, assert the response carries an *announced end date*
   (RFC 8594 ``Sunset``) and not only ``Deprecation: true``. "Kept until its
   announced end date" is unfalsifiable when no end date was ever announced;
   this is the check that makes it falsifiable. Static read of the
   ``mark_deprecated`` contract + the register, so it needs no server.

Exit code is 0 only when every declared surface satisfies its own disposition.

Usage
-----
    python3 scripts/v1_surface_telemetry.py                  # all three halves
    python3 scripts/v1_surface_telemetry.py --source
    python3 scripts/v1_surface_telemetry.py --json out.json
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_SRC = REPO_ROOT / "apps" / "admissions" / "src"
FRONTEND_TESTS = REPO_ROOT / "apps" / "admissions" / "tests"
BACKEND = REPO_ROOT / "backend"

# --------------------------------------------------------------------------- #
# Match classification
# --------------------------------------------------------------------------- #

#: A match in one of these is NOT a first-party production caller.
_TEST_MARKERS = ("/tests/", "/__fixtures__/", ".test.ts", ".test.tsx", ".spec.ts")
_DEV_PREVIEW_MARKERS = ("/src/pages/dev/",)


_COMMENT_LINES_CACHE: dict[str, set[int]] = {}


def _comment_line_numbers(abs_path: Path) -> set[int]:
    """1-indexed line numbers that sit inside a comment.

    A ``//`` line and a ``/* … */`` block, tracked across lines. This matters:
    the retirement notes earlier tasks left behind are multi-line JSDoc, and
    their continuation lines do NOT start with ``*``. Classifying prose as a
    caller would make a zero report unreachable for reasons that are not real.

    For ``.py`` files a **triple-quoted span** is also tracked (task 12.5). Task
    12.2 only ever scanned TypeScript, so this file needed no Python branch; half
    5 scans ``backend/apps`` and ``backend/tests``, where the retirement notes
    live in module and method **docstrings** rather than in ``#`` comments. A
    docstring can never be a caller — nothing in it executes — so counting one as
    production code is the same bug 12.2 §1.2 hit on JSDoc, in the other
    language. Triple-quoted spans that are real string *values* are also marked;
    that is deliberate and safe in the same direction: this classifier decides
    "is this prose", and a string literal is not a call site either.
    """
    key = str(abs_path)
    if key in _COMMENT_LINES_CACHE:
        return _COMMENT_LINES_CACHE[key]
    inside: set[int] = set()
    try:
        text = abs_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        _COMMENT_LINES_CACHE[key] = inside
        return inside
    if abs_path.suffix == ".py":
        _COMMENT_LINES_CACHE[key] = _python_prose_lines(text)
        return _COMMENT_LINES_CACHE[key]
    in_block = False
    for n, raw in enumerate(text.splitlines(), start=1):
        stripped = raw.strip()
        if in_block:
            inside.add(n)
            if "*/" in stripped:
                in_block = False
            continue
        if stripped.startswith(("//", "#")):
            inside.add(n)
            continue
        if "/*" in stripped and "*/" not in stripped.split("/*", 1)[1]:
            inside.add(n)
            in_block = True
    _COMMENT_LINES_CACHE[key] = inside
    return inside


def _python_prose_lines(text: str) -> set[int]:
    """1-indexed line numbers of ``#`` comments and triple-quoted spans in Python.

    Scanned character-by-character over the whole file rather than per line,
    because the opening and closing delimiters of a docstring are usually on
    different lines and a per-line ``startswith`` test cannot see that.
    """
    inside: set[int] = set()
    n = len(text)
    i = 0
    line = 1
    while i < n:
        ch = text[i]
        if ch == "\n":
            line += 1
            i += 1
            continue
        if ch == "#":
            while i < n and text[i] != "\n":
                i += 1
            inside.add(line)
            continue
        if text.startswith(('"""', "'''"), i):
            delim = text[i : i + 3]
            start_line = line
            i += 3
            while i < n and not text.startswith(delim, i):
                if text[i] == "\n":
                    line += 1
                i += 1
            i += 3
            inside.update(range(start_line, line + 1))
            continue
        if ch in ('"', "'"):
            quote = ch
            i += 1
            while i < n and text[i] != quote:
                if text[i] == "\\":
                    i += 1
                elif text[i] == "\n":
                    break
                i += 1
            i += 1
            continue
        i += 1
    return inside


def classify_match(path: str, lineno: str, line: str, self_files: tuple[str, ...]) -> str:
    """Classify one grep hit. ``production`` is the only one that blocks removal."""
    norm = "/" + path.replace(os.sep, "/").lstrip("/")
    if any(marker in norm for marker in _TEST_MARKERS):
        return "test"
    if any(marker in norm for marker in _DEV_PREVIEW_MARKERS):
        return "dev-preview"
    if any(norm.endswith(sf) for sf in self_files):
        return "self"
    try:
        if int(lineno) in _comment_line_numbers(REPO_ROOT / path):
            return "comment"
    except (ValueError, OSError):
        pass
    return "production"


# --------------------------------------------------------------------------- #
# The declared surfaces (data, so the report is reproducible)
# --------------------------------------------------------------------------- #

#: ``removed``            — deleted by task 12.2; must have ZERO production callers.
#: ``already_closed``     — deleted by an earlier task; re-measured here, must be ZERO.
#: ``kept_external``      — a published /api/v1 route kept for external callers;
#:                          must have ZERO first-party production callers AND an
#:                          announced end date (see ``--headers``).
DISPOSITIONS = ("removed", "already_closed", "kept_external")


@dataclass
class Surface:
    id: str
    kind: str  # normalizer | route | workspace | alias
    disposition: str
    what: str
    pattern: str  # the recorded grep pattern (Python re, also fed to grep -E)
    roots: tuple[Path, ...] = (FRONTEND_SRC,)
    self_files: tuple[str, ...] = ()
    successor: str = ""
    note: str = ""
    # populated by the scan
    matches: list[dict[str, str]] = field(default_factory=list)

    @property
    def production_callers(self) -> list[dict[str, str]]:
        return [m for m in self.matches if m["class"] == "production"]

    @property
    def ok(self) -> bool:
        return len(self.production_callers) == 0


SURFACES: tuple[Surface, ...] = (
    # ---- permissive envelope/list normalizers (R14.5, API-02) --------------
    Surface(
        id="normalizer.catalog.collection_key_sniff",
        kind="normalizer",
        disposition="removed",
        what=(
            "services/catalog.ts normalizeCollection: the `{[key]: [...]}` branch "
            "(`{programs:[]}` / `{intakes:[]}` / `{subjects:[]}` / "
            "`{institutions:[]}`) and the 'first array-valued property' fallback"
        ),
        pattern=r"first array-valued property|unexpected response shape for",
        self_files=("src/services/catalog.ts",),
        successor="the one paginated shape {page,pageSize,totalCount,results}",
    ),
    Surface(
        id="normalizer.catalog.mutation_key_sniff",
        kind="normalizer",
        disposition="removed",
        what=(
            "services/catalog.ts mutation unwrappers: the `'program' in response` / "
            "`'intake' in response` / `'institution' in response` re-unwrap of an "
            "already-unwrapped envelope"
        ),
        pattern=r"'(program|intake|institution)' in response",
        self_files=("src/services/catalog.ts",),
        successor="apiClient.request already unwrapped exactly one {success,data}",
    ),
    Surface(
        id="normalizer.admin_catalog.listFrom",
        kind="normalizer",
        disposition="removed",
        what=(
            "services/admin/catalog.ts listFrom: the `.programs`, `.data`, "
            "`.data.results` and `.data.programs` branches (a double envelope and "
            "a domain-keyed list the backend never emits)"
        ),
        pattern=r"response\.data\.(results|programs)|Array\.isArray\(response\.programs\)",
        # BOTH admin list services are declared self here, deliberately: they
        # held the SAME permissive shape in two copies, which is finding API-02
        # itself. Counting one file's copy as a "caller" of the other's would
        # report a dependency that does not exist.
        self_files=("src/services/admin/catalog.ts", "src/services/admin/tenants.ts"),
        successor="the one paginated shape {page,pageSize,totalCount,results}",
    ),
    Surface(
        id="normalizer.admin_tenants.listFromResponse",
        kind="normalizer",
        disposition="removed",
        what=(
            "services/admin/tenants.ts listFromResponse: the `.data` and "
            "`.data.results` double-envelope branches, and listResult's `count` "
            "(DRF default) totalCount fallback"
        ),
        pattern=r"response\.data\.results|response\.totalCount \?\? response\.count",
        self_files=("src/services/admin/tenants.ts", "src/services/admin/catalog.ts"),
        successor="the one paginated shape {page,pageSize,totalCount,results}",
    ),
    Surface(
        id="normalizer.notifications.response_sniff",
        kind="normalizer",
        disposition="removed",
        what=(
            "services/notifications.ts normalizeNotificationsResponse: the bare "
            "array, `{data:[…]}`, `{data:{results}}`, `{data:{notifications}}` and "
            "`{notifications:[…]}` branches, plus the `firstArrayValue` helper "
            "whose length>0 test made an empty page fall through to the next "
            "candidate key. The FUNCTION stays (3 legitimate callers); only the "
            "sniff is gone, and it now reads `.results` and nothing else"
        ),
        # Deliberately NOT `normalizeNotificationsResponse` — the exported reader
        # is kept and called, so matching its name would report its callers as
        # blockers. The pattern targets the DELETED branches.
        pattern=r"firstArrayValue|envelope\.notifications|nested\.notifications",
        self_files=("src/services/notifications.ts",),
        successor="the one paginated shape the notification list publishes",
    ),
    Surface(
        id="normalizer.payments.row_sniff",
        kind="normalizer",
        disposition="removed",
        what=(
            "the payments-list envelope sniff, in TWO copies over ONE endpoint: "
            "services/payments.ts normalizePaymentRows and "
            "hooks/usePaymentStatus.ts normalizeRecords. The `.payments`, `.data` "
            "and `.data.results` branches are deleted and the hook's copy is gone"
        ),
        pattern=r"Array\.isArray\(pay(load|ment)?\.(payments|data)\)|payload\.data\.results",
        self_files=("src/services/payments.ts", "src/hooks/usePaymentStatus.ts"),
        successor="one strict normalizePaymentRows over {page,pageSize,totalCount,results}",
    ),
    Surface(
        id="normalizer.applications.rival_pagination",
        kind="normalizer",
        disposition="removed",
        what=(
            "services/applications.ts normalizePaginatedApplications: the "
            "`.applications` list key, the `.count` DRF-default total and the "
            "`.limit` limit/offset page size — three keys from two rival "
            "pagination contracts. Also narrowed out of "
            "`BackendPaginatedApplications`"
        ),
        pattern=(
            r"Array\.isArray\(response\?\.applications\)"
            r"|response\?\.totalCount \?\? response\?\.count"
            r"|response\?\.pageSize \?\? response\?\.limit"
        ),
        self_files=("src/services/applications.ts",),
        successor="{page,pageSize,totalCount,results} from StandardPagination",
    ),
    Surface(
        id="normalizer.admin_audit.rival_pagination",
        kind="normalizer",
        disposition="removed",
        what=(
            "services/admin/audit.ts: the `result.entries` list-key sniff and the "
            "`result.count` DRF-default pagination-key sniff"
        ),
        pattern=r"result\.entries|result\.totalCount \?\? result\.count",
        self_files=("src/services/admin/audit.ts",),
        successor="{page,pageSize,totalCount,results} from StandardPagination",
    ),
    Surface(
        id="normalizer.sessions.triple_shape",
        kind="normalizer",
        disposition="removed",
        what=(
            "services/sessionService.ts: the bare-array / `{sessions:[...]}` / "
            "`{count}` triple sniff over GET /sessions/"
        ),
        pattern=r"Array\.isArray\(result\?\.sessions\)",
        self_files=("src/services/sessionService.ts",),
        successor="the registered {success,data:[...]} envelope",
    ),
    # ---- duplicate workspaces / routes (STU-23, API-04) -------------------
    Surface(
        id="workspace.student_application_detail",
        kind="workspace",
        disposition="already_closed",
        what=(
            "the SECOND student application workspace at /student/application/:id "
            "(its own getById under its own cache key, its own payment / document "
            "/ interview / timeline rendering, a different action set)"
        ),
        pattern=r"pages/student/ApplicationDetail|student\.applicationDetail",
        roots=(FRONTEND_SRC, FRONTEND_TESTS),
        successor="/student/status (task 10.6 chose it; the duplicate now redirects)",
        note="closed by task 10.6, re-measured here",
    ),
    Surface(
        id="route.applications.email_slip",
        kind="route",
        disposition="already_closed",
        what="POST /api/v1/applications/{id}/email-slip/",
        pattern=r"email-slip",
        roots=(FRONTEND_SRC,),
        successor=".../official-documents/{document_type}/email/",
        note="route removed by 10.6; registry entry de-registered by 12.2",
    ),
    Surface(
        id="route.applications.preview_summary",
        kind="route",
        disposition="already_closed",
        what="GET /api/v1/applications/{id}/preview-summary/",
        pattern=r"preview-summary|previewSummary",
        roots=(FRONTEND_SRC,),
        successor="the deterministic review step (no generative call) — R11.1",
        note="route removed by 7.4; registry entry de-registered by 12.2",
    ),
    Surface(
        id="alias.applications.generate_star",
        kind="alias",
        disposition="already_closed",
        what="applicationService.generate* (5 legacy document-generation methods)",
        pattern=r"applicationService\.generate",
        roots=(FRONTEND_SRC,),
        successor="services/officialDocuments.ts (backend official-document pipeline)",
        note="removed by 10.6; re-measured here",
    ),
    # ---- kept for external compatibility (R2.6, R14.7) --------------------
    Surface(
        id="route.catalog.legacy_institution_write",
        kind="route",
        disposition="kept_external",
        what="POST/PATCH/DELETE /api/v1/catalog/institutions/[{id}/]",
        pattern=r"catalog/institutions/[^']*'\s*,\s*\{\s*method:\s*'(POST|PATCH|PUT|DELETE)",
        successor="/api/v1/admin/institutions/",
        note="frozen by task 5.1; published /api/v1 surface, external callers possible",
    ),
    Surface(
        id="route.catalog.legacy_intake_write",
        kind="route",
        disposition="kept_external",
        what="POST/PATCH/DELETE /api/v1/catalog/intakes/[{id}/]",
        pattern=r"catalog/intakes/[^']*'\s*,\s*\{\s*method:\s*'(POST|PATCH|PUT|DELETE)",
        successor="/api/v1/admin/intakes/",
        note="frozen by task 5.1",
    ),
    Surface(
        id="route.catalog.legacy_program_write",
        kind="route",
        disposition="kept_external",
        what="PATCH/DELETE /api/v1/catalog/programs/{id}/",
        pattern=r"catalog/programs/\$\{[^}]*\}/'\s*,\s*\{\s*method:\s*'(PATCH|PUT|DELETE)",
        successor="/api/v1/admin/institutions/{id}/programs/{id}/",
        note="frozen by task 5.1; POST /catalog/programs/ is the CANONICAL offering create",
    ),
    Surface(
        id="route.applications.condition_verify",
        kind="route",
        disposition="kept_external",
        what="POST /api/v1/applications/{id}/conditions/{cid}/verify/",
        pattern=r"conditions/\$\{[^}]*\}/verify/",
        successor=".../conditions/{cid}/review/ (three outcomes)",
        note="deprecated by 10.6, which measured zero use for the FIRST time",
    ),
)


# --------------------------------------------------------------------------- #
# Half 1 — source telemetry
# --------------------------------------------------------------------------- #

def _grep(pattern: str, roots: tuple[Path, ...]) -> list[tuple[str, str, str]]:
    """Return (relpath, lineno, line) for every match. Uses grep -rEn."""
    existing = [str(r) for r in roots if r.exists()]
    if not existing:
        return []
    proc = subprocess.run(
        ["grep", "-rEn", "--", pattern, *existing],
        capture_output=True,
        text=True,
        check=False,
    )
    out: list[tuple[str, str, str]] = []
    for raw in proc.stdout.splitlines():
        parts = raw.split(":", 2)
        if len(parts) < 3:
            continue
        path, lineno, line = parts
        try:
            rel = str(Path(path).resolve().relative_to(REPO_ROOT))
        except ValueError:
            rel = path
        out.append((rel, lineno, line))
    return out


def run_source(surfaces: tuple[Surface, ...]) -> dict[str, Any]:
    for s in surfaces:
        s.matches = []
        for rel, lineno, line in _grep(s.pattern, s.roots):
            s.matches.append(
                {
                    "file": rel,
                    "line": lineno,
                    "class": classify_match(rel, lineno, line, s.self_files),
                    "text": line.strip()[:180],
                }
            )
    failures = [s.id for s in surfaces if not s.ok]
    return {
        "half": "source",
        "passed": not failures,
        "failures": failures,
        "surfaces": [
            {
                "id": s.id,
                "kind": s.kind,
                "disposition": s.disposition,
                "what": s.what,
                "pattern": s.pattern,
                "roots": [str(r.relative_to(REPO_ROOT)) for r in s.roots],
                "successor": s.successor,
                "note": s.note,
                "production_callers": len(s.production_callers),
                "matches_by_class": {
                    cls: sum(1 for m in s.matches if m["class"] == cls)
                    for cls in sorted({m["class"] for m in s.matches})
                },
                "matches": s.matches,
            }
            for s in surfaces
        ],
    }


# --------------------------------------------------------------------------- #
# Half 2 — route telemetry (registry vs the live URLConf)
# --------------------------------------------------------------------------- #

def run_routes() -> dict[str, Any]:
    result: dict[str, Any] = {"half": "routes", "measured": False}
    sys.path.insert(0, str(REPO_ROOT / "scripts"))
    sys.path.insert(0, str(BACKEND))
    try:
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
        import django  # noqa: PLC0415

        django.setup()
        from django.urls import clear_url_caches  # noqa: PLC0415
        from django.conf import settings  # noqa: PLC0415
        import importlib  # noqa: PLC0415

        import config.urls  # noqa: PLC0415
        import authority_matrix_registry as reg  # noqa: PLC0415
        import inventory_admissions_v2 as inv  # noqa: PLC0415

        settings.ENABLE_JOBS_OPS_ROUTES = True
        # The email and documents URL modules read the flag when they load (task 12.1).
        importlib.reload(importlib.import_module("apps.common.email_urls"))
        importlib.reload(importlib.import_module("apps.documents.urls"))
        importlib.reload(config.urls)
        clear_url_caches()
        catalogue = inv.build_backend_route_catalogue(REPO_ROOT)
    except BaseException as exc:  # noqa: BLE001 - degrade, never guess
        import traceback

        result["error"] = f"{type(exc).__name__}: {exc}".strip() or type(exc).__name__
        result["traceback"] = traceback.format_exc().splitlines()[-6:]
        return result

    live_paths = {r["path"] for r in catalogue.get("routes", [])}
    registry_paths = set(reg.get_registry().keys())
    stale = sorted(registry_paths - live_paths)

    legacy_ids = {
        s.id: s for s in SURFACES if s.kind == "route" and s.disposition != "already_closed"
    }
    retired = {
        s.what: s for s in SURFACES if s.kind == "route" and s.disposition == "already_closed"
    }
    retired_still_live = sorted(
        what for what in retired if any(_route_key(what) in p for p in live_paths)
    )

    result.update(
        {
            "measured": True,
            "live_route_count": len(live_paths),
            "registry_entry_count": len(registry_paths),
            "stale_registry_entries": stale,
            "retired_routes_still_served": retired_still_live,
            "kept_external_route_surfaces": sorted(legacy_ids),
            "passed": not stale and not retired_still_live,
        }
    )
    return result


def _route_key(what: str) -> str:
    """The distinguishing path segment of a declared route surface."""
    m = re.search(r"/([a-z-]+)/$", what.strip())
    return m.group(1) if m else what


# --------------------------------------------------------------------------- #
# Half 3 — announced end date for every kept-external surface
# --------------------------------------------------------------------------- #

def run_headers() -> dict[str, Any]:
    """Every kept-external surface must have an ANNOUNCED end date, not just
    ``Deprecation: true``. Read statically from the two places that can hold
    one: ``mark_deprecated`` (catalog writes) and the compatibility register."""
    findings: list[dict[str, Any]] = []

    telemetry = BACKEND / "apps" / "catalog" / "legacy_write_telemetry.py"
    telemetry_src = telemetry.read_text(encoding="utf-8") if telemetry.exists() else ""
    findings.append(
        {
            "surface": "catalog legacy writes (institution / intake / program)",
            "emits_deprecation": 'response["Deprecation"]' in telemetry_src,
            "emits_sunset": 'response["Sunset"]' in telemetry_src,
            "emits_successor_link": 'rel="successor-version"' in telemetry_src,
            "source": str(telemetry.relative_to(REPO_ROOT)),
        }
    )

    conditions = BACKEND / "apps" / "applications" / "admin_amendment_views.py"
    cond_src = conditions.read_text(encoding="utf-8") if conditions.exists() else ""
    findings.append(
        {
            "surface": "applications .../conditions/{cid}/verify/",
            "emits_deprecation": '"Deprecation"' in cond_src or "'Deprecation'" in cond_src,
            "emits_sunset": '"Sunset"' in cond_src or "'Sunset'" in cond_src,
            "emits_successor_link": "successor-version" in cond_src,
            "source": str(conditions.relative_to(REPO_ROOT)) if conditions.exists() else "?",
        }
    )

    register = BACKEND / "apps" / "common" / "compatibility_register.py"
    registered: list[str] = []
    if register.exists():
        sys.path.insert(0, str(BACKEND))
        try:
            os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
            from apps.common.compatibility_register import (  # noqa: PLC0415
                COMPATIBILITY_SURFACES,
            )

            registered = sorted(COMPATIBILITY_SURFACES)
        except Exception as exc:  # pragma: no cover
            registered = [f"<unreadable: {type(exc).__name__}: {exc}>"]

    missing = [f["surface"] for f in findings if not f["emits_sunset"]]
    return {
        "half": "headers",
        "passed": not missing,
        "surfaces_without_announced_end_date": missing,
        "findings": findings,
        "register_exists": register.exists(),
        "registered_surfaces": registered,
    }


# --------------------------------------------------------------------------- #
# Reporting
# --------------------------------------------------------------------------- #

def render(report: dict[str, Any]) -> str:
    lines: list[str] = []
    w = lines.append
    w("V1 LEGACY-SURFACE CALLER TELEMETRY — admissions-v2 task 12.2")
    w("=" * 78)
    w("R2.5-R2.7, R14.5-R14.7 · findings API-02, API-04, REL-01, STU-23")
    w("")

    src = report["source"]
    w("-- HALF 1: SOURCE TELEMETRY " + "-" * 51)
    w(f"   roots scanned: apps/admissions/src (+ tests where declared)")
    w(f"   a 'production' match is the only kind that blocks a removal;")
    w(f"   test pins, dev-preview callers, the definition itself and comments")
    w(f"   are counted and shown separately rather than filtered out silently.")
    w("")
    w(f"   {'surface':<48} {'disp':<15} {'prod':>4}  other")
    for s in src["surfaces"]:
        other = ", ".join(
            f"{k}={v}" for k, v in sorted(s["matches_by_class"].items()) if k != "production"
        )
        w(f"   {s['id']:<48} {s['disposition']:<15} {s['production_callers']:>4}  {other or '-'}")
    w("")
    w(f"   PASS={src['passed']}  failures={src['failures'] or 'none'}")
    w("")

    for s in src["surfaces"]:
        w(f"   [{s['id']}]")
        w(f"     what      : {s['what']}")
        w(f"     pattern   : {s['pattern']}")
        w(f"     successor : {s['successor'] or '-'}")
        if s["note"]:
            w(f"     note      : {s['note']}")
        if not s["matches"]:
            w("     matches   : (none)")
        for m in s["matches"]:
            w(f"     {m['class']:<11}: {m['file']}:{m['line']}  {m['text']}")
        w("")

    rt = report["routes"]
    w("-- HALF 2: ROUTE TELEMETRY (registry vs the LIVE URLConf) " + "-" * 20)
    if not rt.get("measured"):
        w(f"   not_measured: {rt.get('error')}")
    else:
        w(f"   live routes            : {rt['live_route_count']}")
        w(f"   registry entries       : {rt['registry_entry_count']}")
        w(f"   stale registry entries : {rt['stale_registry_entries'] or 'none'}")
        w(f"   retired routes still served : {rt['retired_routes_still_served'] or 'none'}")
        w(f"   kept-external surfaces : {len(rt['kept_external_route_surfaces'])}")
        w(f"   PASS={rt['passed']}")
    w("")

    hd = report["headers"]
    w("-- HALF 3: ANNOUNCED END DATE FOR EVERY KEPT-EXTERNAL SURFACE " + "-" * 16)
    for f in hd["findings"]:
        w(
            f"   {f['surface']:<52} Deprecation={f['emits_deprecation']!s:<5} "
            f"Sunset={f['emits_sunset']!s:<5} Link={f['emits_successor_link']}"
        )
    w(f"   compatibility register present : {hd['register_exists']}")
    for r in hd["registered_surfaces"]:
        w(f"     registered: {r}")
    w(f"   PASS={hd['passed']}  missing={hd['surfaces_without_announced_end_date'] or 'none'}")
    w("")
    w("=" * 78)
    w(f"OVERALL PASS = {report['passed']}   (halves 1-3, the V1 surface verdict)")

    cd = report.get("columns")
    if cd and not cd.get("skipped"):
        w("")
        w("=" * 78)
        w("HALF 4: LEGACY-COLUMN TELEMETRY (task 12.3) " + "-" * 34)
        w("registry: backend/apps/common/legacy_columns.py")
        w(f"sunset date declared: {cd['sunset_date']}   today: {cd['today']}   "
          f"days remaining: {cd['days_until_sunset']}")
        w("")
        w(f"   {'column':<34} {'orm':<5} {'prod':>4} {'api':>4} {'ddl':>4} "
          f"{'other':>5} {'test':>4} {'cmt':>4}  disposition")
        for c in cd["columns"]:
            w(
                f"   {c['qualified']:<34} {('yes' if c['orm_mapped'] else 'no'):<5} "
                f"{c['production']:>4} {c['generated_contract']:>4} "
                f"{c['schema_ddl']:>4} {c['other_model']:>5} {c['test']:>4} "
                f"{c['comment']:>4}  {c['disposition']}"
            )
        w("")
        w("   orm   = the owning Django model declares this field, so the ORM names")
        w("           the column in every default SELECT/INSERT for that model")
        w("   prod  = first-party production reference that can reach THIS column")
        w("   api   = the NAME appears in apps/admissions/src/generated/api.d.ts.")
        w("           It only BLOCKS when orm=yes — otherwise the identically named")
        w("           serializer field is sourced from the payments ledger, not from")
        w("           this column, and dropping the column cannot move the contract")
        w("   ddl   = a .sql file naming the column. About this column, but not a")
        w("           runtime reference")
        w("   other = a same-named attribute on a DIFFERENT model. Not a reference")
        w("           to this column: an unmapped column is unreachable through the")
        w("           ORM, so `x.amount` cannot be `applications.amount`")
        w("")
        for line in cd["notes"]:
            w(f"   note: {line}")
        w("")
        w(f"   contractable now : {cd['gates']['contractable'] or 'none'}")
        w(f"   blocked          : {cd['gates']['blocked'] or 'none'}")
        w(f"   already done     : {cd['gates']['already_contracted'] or 'none'}")
        w(f"   HALF 4 PASS={cd['passed']}")
        w("")
        w("   HALF 4 measures SOURCE only. The database-side gates (legacy-row")
        w("   count, canonical/snapshot, payment projection) are")
        w("   docs/v2-evidence/12.3/invariants.sql — a column with zero source")
        w("   references is still not contractable while it holds data.")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Half 4 — legacy-column telemetry (task 12.3)
# --------------------------------------------------------------------------- #

#: Which Django model owns each registry table, for the ORM-mapping check below.
_TABLE_MODEL_SOURCE: dict[str, tuple[str, str]] = {
    "applications": ("backend/apps/applications/models.py", "Application"),
    "profiles": ("backend/apps/accounts/models.py", "Profile"),
    "error_logs": ("backend/apps/common/models.py", "ErrorLog"),
}

#: Files that ARE the registry / runbook / migration for these columns. A mention
#: here is the deprecation machinery talking about itself, not a consumer.
_COLUMN_SELF_FILES: tuple[str, ...] = (
    "backend/apps/common/legacy_columns.py",
    "backend/scripts/legacy_columns_drop_2026_08_15.sql",
    "backend/scripts/future/legacy_columns_contract_2026_08_15.sql",
    "backend/scripts/future/legacy_columns_contract_2026_08_15_rollback.sql",
    "backend/scripts/schema_cleanup_drop_stale_columns.sql",
    "backend/scripts/schema_cleanup_drop_stale_columns_rollback.sql",
    "backend/apps/common/compatibility_register.py",
)

#: The generated OpenAPI client types. A hit here means the column is part of the
#: PUBLISHED contract — which is a stronger blocker than an internal caller,
#: because it is what an external consumer codegens against.
_GENERATED_CONTRACT = "apps/admissions/src/generated/api.d.ts"


def _load_legacy_registry() -> tuple[dict[str, Any], str]:
    """Import ``legacy_columns.py`` by path (it has no Django dependency)."""
    import importlib.util

    path = REPO_ROOT / "backend" / "apps" / "common" / "legacy_columns.py"
    spec = importlib.util.spec_from_file_location("_legacy_columns_12_3", path)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod.LEGACY_DEPRECATED_COLUMNS, mod.SUNSET_DATE


def _model_declared_fields(rel_source: str, class_name: str) -> set[str]:
    """Field names a Django model class declares, via AST.

    This is the rigorous half of the classification. Django includes every
    DECLARED field in a model's default SELECT and INSERT column list; a column
    the model does not declare is unreachable through the ORM no matter what the
    code writes. So an attribute assignment ``x.amount = 1`` cannot possibly be a
    write to ``applications.amount`` when ``Application`` declares no ``amount``
    — it is a same-named attribute on some other object.

    ``backend/tests/unit/test_legacy_columns_no_writes.py`` did not make this
    distinction and its ``_KNOWN_DAY0_VIOLATIONS`` allow-list carried six entries
    that were never violations. See task 12.3 evidence §6.1.
    """
    path = REPO_ROOT / rel_source
    if not path.exists():
        return set()
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            names: set[str] = set()
            for stmt in node.body:
                if isinstance(stmt, ast.Assign):
                    for t in stmt.targets:
                        if isinstance(t, ast.Name):
                            names.add(t.id)
                            # A ForeignKey's column is <name>_id unless db_column
                            # renames it; record both spellings.
                            names.add(f"{t.id}_id")
                elif isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                    names.add(stmt.target.id)
            return names
    return set()


def run_columns() -> dict[str, Any]:
    """Source telemetry for every column in the legacy deprecation registry."""
    registry, sunset_date = _load_legacy_registry()
    today = date.today()
    sunset = date.fromisoformat(sunset_date)

    roots = (
        REPO_ROOT / "backend" / "apps",
        REPO_ROOT / "backend" / "scripts",
        FRONTEND_SRC,
        FRONTEND_TESTS,
        REPO_ROOT / "apps" / "jobs-ops" / "src",
    )

    results: list[dict[str, Any]] = []
    notes: list[str] = []

    for table, entries in registry.items():
        source, model = _TABLE_MODEL_SOURCE.get(table, ("", ""))
        declared = _model_declared_fields(source, model) if source else set()
        for column in sorted(entries):
            if column == "__entire_table__":
                continue
            orm_mapped = column in declared

            # Word-boundary match on the bare column name. Deliberately broad:
            # narrowing the pattern would hide the very hits that need
            # classifying, and half 4 classifies rather than filters (12.2 §18 #9).
            pattern = rf"\b{re.escape(column)}\b"
            buckets = {
                "production": 0, "generated_contract": 0, "other_model": 0,
                "schema_ddl": 0, "test": 0, "comment": 0, "self": 0, "dev-preview": 0,
            }
            hits: list[dict[str, str]] = []
            for rel, lineno, line in _grep(pattern, roots):
                cls = classify_match(rel, lineno, line, _COLUMN_SELF_FILES)
                if cls == "production":
                    if rel.endswith(".sql"):
                        # A DDL file naming the column IS about this column, but
                        # it is not a runtime reference. Its own class, so it is
                        # neither counted as a caller nor silently dropped.
                        cls = "schema_ddl"
                    elif rel == _GENERATED_CONTRACT:
                        cls = "generated_contract"
                    elif not orm_mapped:
                        # Unreachable through the ORM for this table, so whatever
                        # this hit refers to, it is not this column.
                        cls = "other_model"
                buckets[cls] = buckets.get(cls, 0) + 1
                hits.append(
                    {"file": rel, "line": lineno, "class": cls, "text": line.strip()[:180]}
                )

            # A name in the generated contract only blocks when the owning model
            # actually declares the field. `payment_method`, `paid_at` and
            # `paid_amount` are all names in api.d.ts AND names of legacy
            # applications columns — but the serializer fields behind them are
            # SerializerMethodFields sourced from the payments ledger
            # (ApplicationPaymentSummaryMixin), so the unmapped column cannot be
            # feeding them. Counting the collision as a blocker was this half's
            # first bug; see task 12.3 evidence §6.2.
            contract_blocks = buckets["generated_contract"] if orm_mapped else 0
            blocking = buckets["production"] + contract_blocks
            if blocking:
                disposition = "BLOCKED — published surface / live reference"
            else:
                disposition = "source-clean (db gates still apply)"

            results.append(
                {
                    "table": table,
                    "column": column,
                    "qualified": f"{table}.{column}",
                    "orm_mapped": orm_mapped,
                    "production": buckets["production"],
                    "generated_contract": buckets["generated_contract"],
                    "other_model": buckets["other_model"],
                    "schema_ddl": buckets["schema_ddl"],
                    "test": buckets["test"],
                    "comment": buckets["comment"],
                    "self": buckets["self"],
                    "dev_preview": buckets["dev-preview"],
                    "contract_blocks": contract_blocks,
                    "disposition": disposition,
                    "source_clean": blocking == 0,
                    "matches": hits,
                }
            )

    contractable = [c["qualified"] for c in results if c["source_clean"]]
    blocked = [c["qualified"] for c in results if not c["source_clean"]]

    # Registry tables with nothing left to enumerate. `profiles` is an EMPTY dict
    # in the registry because its three columns were contracted on 2026-07-12 by
    # schema_cleanup_drop_stale_columns.sql; `error_logs` carries only
    # __entire_table__, which is a table and not a column. Reported rather than
    # omitted: a reader counting rows would otherwise wonder where they went.
    already: list[str] = []
    for table, entries in registry.items():
        cols = [c for c in entries if c != "__entire_table__"]
        if not cols:
            if is_entire_table := ("__entire_table__" in entries):
                already.append(f"{table} (entire table — not a column; out of scope)")
            else:
                already.append(f"{table} (registry empty — already contracted)")
            del is_entire_table

    for c in results:
        if c["other_model"] and not c["orm_mapped"]:
            notes.append(
                f"{c['qualified']}: {c['other_model']} same-named attribute hit(s) on "
                f"another model — the owning model declares no such field, so none of "
                f"them can reach this column"
            )
        if c["generated_contract"] and not c["orm_mapped"]:
            notes.append(
                f"{c['qualified']}: {c['generated_contract']} hit(s) in the generated "
                f"OpenAPI contract are a NAME COLLISION, not this column — the "
                f"serializer field is sourced from the payments ledger, and an "
                f"unmapped column cannot feed a serializer"
            )
    if blocked:
        notes.append(
            "a blocked column needs a registered Legacy_Exception with an owner and "
            "an announced end date (apps/common/compatibility_register.py), not a drop"
        )

    return {
        "half": "columns",
        # Source-clean is necessary, not sufficient: the database gates in
        # docs/v2-evidence/12.3/invariants.sql are the rest of R15.6.
        "passed": not blocked,
        "sunset_date": sunset_date,
        "today": today.isoformat(),
        "days_until_sunset": (sunset - today).days,
        "gates": {
            "contractable": contractable,
            "blocked": blocked,
            "already_contracted": already,
        },
        "notes": notes,
        "columns": results,
    }


# --------------------------------------------------------------------------- #
# Half 5 — the canonical-path review manifest (task 12.5)
# --------------------------------------------------------------------------- #
#
# Task 12.5's bullet names THIRTEEN search categories and then states the real
# deliverable: *"Every remaining match must be canonical, test fixture, immutable
# evidence, or a registered Legacy_Exception with owner/removal date."* That is a
# four-way classification with an implicit fifth bucket — "unregistered" — which
# must be empty.
#
# Why this is a mode on THIS tool and not a fourth instrument
# ----------------------------------------------------------
# Three instruments already exist and the split between them is a real one:
#
#   * ``scripts/module-size-report.ts`` (12.1 + 12.4) owns the **graph**: which
#     module imports which, whether a specifier resolves, whether a binding is
#     referenced. 12.4 §1.1 chose it for the dependency audit for exactly that
#     reason.
#   * ``scripts/inventory_admissions_v2.py`` (0.3) owns the **route/authority
#     catalogue**: it walks the live URLConf and classifies each view's authority.
#   * this file (12.2) owns **declared-surface pattern telemetry**: N declared
#     surfaces, one recorded pattern each, every hit printed with a class so a
#     reader can dispute the classification rather than take a count on trust.
#
# 12.5 is a pattern question over 13 declared categories spanning TypeScript and
# Python, and the answer has to be a *manifest of classified hits*. That is this
# file's existing shape, so half 5 is added here. It reuses ``_grep`` and the
# block-comment tracker (now extended to Python docstrings, above) unchanged.
#
# What half 5 deliberately does NOT do
# ------------------------------------
# It does not re-implement the executable guards that already own these
# categories. Each category names its guard(s), and the mode asserts the guard
# FILE EXISTS — 12.4 §16 #3's lesson ("a guard named in a comment is not a
# guard") turned into a check. The guards are run separately, as pytest/vitest,
# and their output is recorded in ``docs/v2-evidence/12.5/raw/``. A manifest that
# re-derived what a guard already asserts would be a second, weaker copy of it.
#
# And it does not hand-roll a TSX parser. 12.4 §1.2 wrote one, measured it
# accusing ~270 live imports because an apostrophe in JSX text is
# indistinguishable from a string delimiter, and threw it away. Half 5 asks only
# "does this line match this recorded regex, and what file is it in" — a question
# a line-oriented grep answers correctly — and delegates every "is this
# referenced / is this reachable" question to the guards and to
# ``module-size-report.ts``.

#: The four buckets the bullet names, plus the two it implies and the one that
#: must be empty.
#:
#: ``comment`` and ``dev-preview`` are additions, stated as additions. The bullet
#: lists four legitimate buckets; filtering a comment or a dev-preview hit out of
#: the report would satisfy the letter of "zero unregistered" by making hits
#: invisible, which is 12.2 §18 #9's exact warning ("classify a match, do not
#: filter it"). So they are buckets with reasons, printed like the rest.
REVIEW_BUCKETS = (
    "canonical",  # the hit IS the canonical implementation, guard, or detector
    "test-fixture",  # a test, fixture, or spec pin
    "immutable-evidence",  # docs/v2-evidence/**, docs/audits/**, archived specs (R2.7)
    "registered-exception",  # named in a register with an owner and a removal date
    "comment",  # prose, incl. a comment recording the retirement
    "dev-preview",  # a surface steering explicitly permits as dev/preview-only
    "unregistered",  # MUST BE EMPTY — the verdict of this half
)

#: Paths that are immutable historical evidence (R2.7). A match here is never a
#: violation and must never be rewritten to match the present.
_IMMUTABLE_PREFIXES = (
    "docs/v2-evidence/",
    "docs/audits/",
    ".kiro/specs/_archived/",
    "AUDIT-REPORT-",
    "docs/security-api-audit-",
    "docs/full-audit-report-",
)

#: Paths whose matches are test fixtures / pins rather than product behaviour.
_TEST_PREFIXES = (
    "apps/admissions/tests/",
    "apps/jobs-ops/tests/",
    "backend/tests/",
)
_TEST_SUFFIXES = (".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")
_TEST_SUBSTRINGS = ("/__fixtures__/", "/tests/", "conftest.py")


@dataclass(frozen=True)
class Rule:
    """One classification rule. Ordered; the first match wins.

    ``paths`` is a tuple of repo-relative **substrings**; ``text`` is a regex the
    matched line must satisfy. Both empty means "everything left". Every rule
    carries a ``reason``, because a bucket without a reason is a filter wearing a
    classification's clothes.

    ``window`` widens ``text`` to the matched line **plus N lines either side**,
    and it exists because of a measured mistake in this very run. Task 12.2's own
    ``route.catalog.legacy_*_write`` patterns require the endpoint literal and
    ``, { method: 'POST'`` on **one** line, but ``services/catalog.ts`` writes the
    method on the *next* line — and ``_grep`` shells out to line-oriented
    ``grep -E``, so no amount of ``\\s*`` in the pattern can span the newline.
    The same shape appears in ``backend/apps``: a role read on one line and the
    ``AccessScopeService`` call that supplies the actual authority three lines
    below it. A window is the honest fix; it is stated with its size so a reader
    can dispute the size rather than discover the assumption.

    The window is **symmetric** because the two directions are both real: a
    normalizer runs *before* the comparison that uses its result, and a scope
    check runs *after* the role read that selects it. The residual risk is stated
    rather than hidden — a window can in principle pair a hit with an unrelated
    marker inside the same span, which is why every hit is printed with its
    ``file:line`` and its reason so a reader can check the pairing.
    """

    bucket: str
    reason: str
    paths: tuple[str, ...] = ()
    text: str = ""
    text_absent: str = ""
    window: int = 0

    def matches(self, rel: str, line: str, following: str = "") -> bool:
        if self.paths and not any(p in rel for p in self.paths):
            return False
        haystack = line if self.window == 0 else line + "\n" + following
        if self.text and not re.search(self.text, haystack):
            return False
        if self.text_absent and re.search(self.text_absent, haystack):
            return False
        return True


@dataclass
class ReviewCategory:
    n: int
    id: str
    title: str  # the bullet's own words for this category
    owning_task: str
    requirement: str
    pattern: str
    roots: tuple[Path, ...]
    rules: tuple[Rule, ...]
    guards: tuple[str, ...] = ()  # existing executable guards that own the category
    note: str = ""
    hits: list[dict[str, str]] = field(default_factory=list)

    @property
    def unregistered(self) -> list[dict[str, str]]:
        return [h for h in self.hits if h["bucket"] == "unregistered"]

    @property
    def ok(self) -> bool:
        return not self.unregistered


FRONT_PROD = FRONTEND_SRC
FRONT_TESTS = FRONTEND_TESTS
BACK_APPS = BACKEND / "apps"
BACK_TESTS = BACKEND / "tests"
JOBS_SRC = REPO_ROOT / "apps" / "jobs-ops" / "src"
TOOL_SCRIPTS = REPO_ROOT / "scripts"

#: The register category 5 defers to — 12.5 §2.5's lesson, "one category, one
#: authority". Read, never restated: see ``_brand_allowlist_rules``.
BRAND_ALLOWLIST = REPO_ROOT / "docs" / "legacy-brand-allowlist.json"

#: Task 12.5's buckets a brand-allowlist entry may take when it is permanent by
#: design. ``backend/tests/unit/test_brand_drift_guard.py::PERMANENT_BUCKETS`` is
#: the enforcing copy; this tool only reads entries against it.
_BRAND_PERMANENT_BUCKETS = ("canonical", "test-fixture", "immutable-evidence", "comment")


def _brand_allowlist_entries() -> list[dict[str, Any]]:
    """The brand register's entries, or ``[]`` when it cannot be read.

    ``[]`` is the safe direction: with no register rule, every brand hit that is not
    prose or a dev-preview surface lands in ``unregistered`` and fails half 5.
    """
    try:
        data = json.loads(BRAND_ALLOWLIST.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [
        e for e in data.get("allowlist", [])
        if isinstance(e, dict) and isinstance(e.get("path"), str)
    ]


def _brand_allowlist_rules() -> tuple[Rule, ...]:
    """Category 5's register rules, one per entry, READ from the register.

    Task 12.5 pass 2 (GATE-13.6-01) split the brand allowlist into two populations
    (its ``legacyExceptionPolicy``). Each entry becomes the rule its own population
    implies, so this manifest never keeps a second copy of the register — the
    mistake 12.5 §2.5 deleted:

    * a **Legacy_Exception** (``removeBy``) -> ``registered-exception``, with the
      entry's owner and removal date in the reason, so the clause's
      "owner/removal date" is visible at every such hit;
    * a **permanent-by-design** entry -> its own ``reviewBucket``, with its own
      ``permanentBecause`` as the reason — EXCEPT ``comment``, which gets no rule:
      the comment tracker must claim each hit, so a brand string on a non-prose
      line of a "prose only" file falls through to ``unregistered``. That is the
      discriminating half of the permanence claim;
    * an entry in neither population, both, or an unknown bucket gets no rule,
      so its hits surface as ``unregistered`` rather than being trusted.
    """
    rules: list[Rule] = []
    for entry in _brand_allowlist_entries():
        dated = "removeBy" in entry
        bucket = entry.get("reviewBucket")
        permanent = bucket is not None or "permanentBecause" in entry
        if dated and not permanent:
            rules.append(
                Rule(
                    bucket="registered-exception",
                    reason=(
                        "Legacy_Exception in docs/legacy-brand-allowlist.json — owner "
                        f"{entry.get('owner')}, removeBy {entry.get('removeBy')} (task 12.2's "
                        "window: test_brand_drift_guard.py pins it to compatibility_register "
                        "and both brand guards fail once it closes) · "
                        f"{entry.get('classification')}"
                    ),
                    paths=(entry["path"],),
                )
            )
        elif (
            permanent
            and not dated
            and bucket in _BRAND_PERMANENT_BUCKETS
            and bucket != "comment"
        ):
            rules.append(
                Rule(
                    bucket=bucket,
                    reason=(
                        "permanent by design per docs/legacy-brand-allowlist.json (owner "
                        f"{entry.get('owner')}, no removal date by design): "
                        f"{entry.get('permanentBecause')}"
                    ),
                    paths=(entry["path"],),
                )
            )
    return tuple(rules)


REVIEW_CATEGORIES: tuple[ReviewCategory, ...] = (
    # ---- 1 ---------------------------------------------------------------- #
    ReviewCategory(
        n=1,
        id="legacy_catalog_writes",
        title="legacy institution/program/intake writes",
        owning_task="5.1 froze them; 12.2 registered their window",
        requirement="R7.1, R7.3, R14.7 · no-legacy-hardcoding rule",
        # The frozen legacy write paths, as an endpoint literal a caller would
        # have to write. Deliberately NOT narrowed to a write verb: a read of the
        # same literal is still a first-party dependency on the frozen surface
        # and must be shown, and narrowing to reach zero is the failure mode this
        # task exists to catch.
        pattern=r"/catalog/(institutions|intakes|programs)|X-Legacy-Catalog-Write|catalog\.legacy_write",
        roots=(FRONT_PROD, FRONT_TESTS, BACK_APPS, BACK_TESTS, TOOL_SCRIPTS),
        guards=(
            "backend/tests/unit/test_canonical_tenant_drift_guard.py",
            "backend/tests/unit/test_compatibility_surfaces_12_2.py",
        ),
        rules=(
            Rule(
                bucket="canonical",
                reason=(
                    "the frozen route itself, or task 5.1's own telemetry seam that "
                    "measures it (X-Legacy-Catalog-Write / catalog.legacy_write)"
                ),
                paths=(
                    "backend/apps/catalog/legacy_write_telemetry.py",
                    "backend/apps/catalog/institution_views.py",
                    "backend/apps/catalog/intake_views.py",
                    "backend/apps/catalog/program_views.py",
                    "backend/apps/catalog/urls.py",
                ),
            ),
            Rule(
                bucket="registered-exception",
                reason=(
                    "compatibility_register.py — catalog.legacy_{institution,intake,"
                    "program}_write, owner platform-admissions, end date 2027-02-07"
                ),
                paths=("backend/apps/common/compatibility_register.py",),
            ),
            Rule(
                bucket="canonical",
                reason="the review instrument's own declared pattern (this file / 0.3's catalogue)",
                paths=("scripts/",),
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "the GENERATED OpenAPI client types. These mirror the published "
                    "contract and change only by regenerating the schema — the frozen "
                    "routes are still served, so the contract still declares them"
                ),
                paths=("apps/admissions/src/generated/api.d.ts",),
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "a catalog **read**: no write method appears within 3 lines of the "
                    "endpoint literal. Steering preserves public/student GET on the "
                    "catalog endpoints; the frozen surface is POST/PATCH/DELETE on "
                    "institutions and intakes and PATCH/DELETE on programs — POST "
                    "/catalog/programs/ is the CANONICAL offering create (R7.1)"
                ),
                text_absent=r"method:\s*'(POST|PATCH|PUT|DELETE)'",
                window=3,
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "POST /catalog/programs/ — the CANONICAL offering-create path "
                    "(R7.1), explicitly excluded from the frozen window by the "
                    "compatibility register's own exit criteria"
                ),
                text=r"'/catalog/programs/'",
                text_absent=r"method:\s*'(PATCH|PUT|DELETE)'",
                window=3,
            ),
        ),
        note=(
            "The legacy applications.institution/program/intake DISPLAY-STRING half "
            "of this category is not a text pattern — it is an AST question, and "
            "test_canonical_tenant_drift_guard.py already answers it with a 13-entry "
            "_ALLOWED_PREDICATES register. Half 5b audits that register; re-greping "
            "it here would be a weaker second copy."
        ),
    ),
    # ---- 2 ---------------------------------------------------------------- #
    ReviewCategory(
        n=2,
        id="raw_role_authorization",
        title="raw role authorization",
        owning_task="2.1 / 2.2 converted the endpoints",
        requirement="R3 · enterprise-tenancy: every authority decision resolves "
        "through AdminCapabilityService; never a raw role-string comparison in "
        "endpoint code",
        # 0.3's own RAW_ROLE_PATTERNS, unioned into one recorded regex so the
        # count is reproducible from one line. `role in (...)` / `role == "..."` /
        # is_super_admin( / .role == "..." — the four shapes a role decision takes.
        pattern=r"\brole\s+in\s*[\(\[\{]|\brole\s*(==|!=)\s*['\"]|\.role\s*(==|!=)\s*['\"]|\bis_super_admin\s*\(",
        roots=(BACK_APPS, FRONT_PROD),
        guards=(
            "backend/tests/unit/test_authority_matrix_v2.py",
            "backend/tests/unit/test_admissions_v2_authority_policies.py",
            "backend/tests/unit/test_view_auth_classification.py",
        ),
        rules=(
            Rule(
                bucket="canonical",
                reason=(
                    "AdminCapabilityService / the DRF capability primitives / the role "
                    "hierarchy model itself — these are where a role string is DEFINED "
                    "and resolved into capabilities, which is the canonical path, not a "
                    "bypass of it"
                ),
                paths=(
                    "backend/apps/catalog/services.py",
                    "backend/apps/catalog/permissions.py",
                    "backend/apps/accounts/models.py",
                    "backend/apps/accounts/permissions.py",
                    "backend/apps/common/permissions.py",
                ),
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "Super_Admin. The steering's own role model says platform authority "
                    "*comes only from* `role == \"super_admin\"` and is never derived "
                    "from a membership or grant, so this comparison IS the canonical "
                    "way to establish it — the rule it must not replace is deriving "
                    "TENANT authority from the bare `admin` string"
                ),
                text=r"role\s*(==|!=)\s*['\"]super_admin['\"]"
                r"|\.role\s*(==|!=)\s*['\"]super_admin['\"]"
                r"|\bis_super_admin\s*\(",
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "the role is recorded as an ATTRIBUTE, not consulted for authority: "
                    "an audit `actor_role`, a document `provenance` label, or a bounded "
                    "metric tag. Writing down who acted is not deciding whether they may"
                ),
                text=r"actor_role|provenance|PROVENANCE_|user_role|\"role\":|'role':"
                r"|role_tag|_ALLOWED_ROLES",
                window=2,
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "ApplicationDetailView — the role read selects BEHAVIOUR (may an "
                    "actor mutate a non-draft; are the two intake-capacity fields "
                    "included), not ACCESS. Access is already resolved by this view's "
                    "own `_get_application`, which applies IsOwnerOrAdmin and then "
                    "`AccessScopeService.filter_applications` before returning, masking "
                    "an out-of-scope id as 404. The endpoint's authority is registered "
                    "at scripts/authority_matrix_registry.py:512 as "
                    "owner(composed=['tenant.application.read'])"
                ),
                paths=("backend/apps/applications/student_draft_views.py",),
                text=r"role in \('admin', 'super_admin'\)",
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "a role read that only SELECTS which scope check to apply, with the "
                    "actual authority resolved by AccessScopeService / "
                    "AdminCapabilityService / the named `_staff_can_access_application` "
                    "helper within 20 lines either side. The discriminating property is "
                    "the scope call: a role read with no capability or scope resolution "
                    "anywhere in its window stays unregistered"
                ),
                text=r"AccessScopeService|filter_applications|filter_payments|"
                r"filter_documents|visible_institution_queryset|require_capability|"
                r"require_institution_capability|require_application_capability|"
                r"AdminCapabilityService|_staff_can_access_application|"
                r"_get_authorized_application|get_scoped_object",
                window=20,
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "the frontend capability context / role-hierarchy display, which "
                    "consumes GET /admin/capabilities/ and is never the security "
                    "boundary (enterprise-tenancy: frontend hiding is not the boundary)"
                ),
                paths=(
                    "apps/admissions/src/contexts/",
                    "apps/admissions/src/lib/roleHierarchy",
                    "apps/admissions/src/services/admin/capabilities.ts",
                ),
            ),
        ),
    ),
    # ---- 3 ---------------------------------------------------------------- #
    ReviewCategory(
        n=3,
        id="invented_permissions",
        title="invented permissions",
        owning_task="2.4 removed the colon vocabulary and the unsupported roles",
        requirement="R3.4 · finding AUTH-04",
        # The exact vocabulary task 2.4 retired, from its own guard, plus the four
        # unsupported roles.
        pattern=(
            r"\b(users|applications|payments|programs|documents|profile|settings|"
            r"analytics|notifications|audit|student|reviewer|admin|super_admin|owner):"
            r"(read|write|delete|create|review|verify|access|make_own|read_own|"
            r"update_own|upload_own)\b"
            r"|\b(admissions_officer|registrar|finance_officer|academic_head)\b"
        ),
        roots=(FRONT_PROD, FRONT_TESTS, BACK_APPS, BACK_TESTS),
        guards=("backend/tests/unit/test_no_invented_permissions_guard.py",),
        rules=(
            Rule(
                bucket="canonical",
                reason="the guard's own pattern definition (a detector is not a violation)",
                paths=("backend/tests/unit/test_no_invented_permissions_guard.py",),
            ),
        ),
    ),
    # ---- 4 ---------------------------------------------------------------- #
    ReviewCategory(
        n=4,
        id="raw_uuid_form_labels",
        title="raw UUID form labels",
        owning_task="4.3 and 11.4 replaced them with scoped search selectors",
        requirement="R6.3 · finding TEN-05",
        pattern=(
            r"placeholder=[\"'{`][^\"'}`]*(UUID|uuid)"
            r"|aria-label=[\"'{`][^\"'}`]*\bID[\"'`]"
            r"|Optional UUID|Application ID\"|paste (a )?raw UUID"
        ),
        roots=(FRONT_PROD, FRONT_TESTS),
        guards=(
            "apps/admissions/tests/harness-e2e/required/admin-mobile-journeys.spec.ts",
            "apps/admissions/tests/unit/tenantAccessGrantsPanel.test.tsx",
            "apps/admissions/tests/unit/onboardingCatalogSteps.test.tsx",
        ),
        rules=(),
        note=(
            "11.4 §6 records that two panels now DOCUMENT the field they replaced, "
            "quoting the old placeholder, and that its jsdom scan strips comments "
            "for exactly that reason: a scan that matched prose would forbid "
            "recording the history. The comment rule reproduces that."
        ),
    ),
    # ---- 5 ---------------------------------------------------------------- #
    ReviewCategory(
        n=5,
        id="hardcoded_fees_support_brands",
        title="hardcoded fees/support/brands",
        owning_task="5.4 deleted the K150/name fallback, 8.1 the frontend 1% "
        "arithmetic, 11.5 resolved brand/support through tenant context",
        requirement="R7.4, R16.7 · findings STU-08, STU-24, TEN-09 · "
        "no-legacy-hardcoding rule",
        # Three shapes in one recorded pattern: a Kwacha literal, a legacy-tenant
        # brand token, and a hardcoded legacy-school support address.
        pattern=(
            r"\bK ?1[0-9]{2}\b|\bMIHAS\b|\bKATC\b|\bMukuba\b|\bKalulushi\b"
            r"|[a-z0-9._%+-]+@(mihas|katc)\.[a-z.]+|mihas\.(localhost|edu\.zm|beanola\.com)"
        ),
        # ``backend/config`` is in the roots because the brand drift guard scans
        # it and this category must not have a smaller surface than the register
        # it defers to — task 12.5 found ``config/settings/harness.py`` there.
        roots=(FRONT_PROD, BACK_APPS, BACKEND / "config", JOBS_SRC),
        guards=(
            "apps/admissions/tests/unit/tenantSupportContact.test.ts",
            "apps/admissions/tests/unit/feeProviderSourceScan.test.ts",
            "backend/tests/unit/test_canonical_tenant_drift_guard.py",
            # The register's own pair — named since 12.5 pass 2. §2.5 called the
            # backend half "the executable guard category 5 names as its
            # authority", and the tuple did not list it.
            "backend/tests/unit/test_brand_drift_guard.py",
            "apps/admissions/tests/unit/brandDriftGuard.test.ts",
        ),
        rules=(
            # The register's rules come FIRST, one per entry, read from
            # docs/legacy-brand-allowlist.json (task 12.5 pass 2). A dated entry's
            # hits are `registered-exception` with its owner/date; a permanent
            # entry's hits take its own reviewBucket. The client-preview files are
            # dated entries, so the dev-preview rule below now only catches a
            # preview-surface hit the register does not cover — none, today.
            *_brand_allowlist_rules(),
            Rule(
                bucket="dev-preview",
                reason=(
                    "the dev/preview PDF surface tech.md explicitly permits, and which "
                    "12.4 §3 measured ABSENT from the production bundle. Its MIHAS/KATC "
                    "rows are transcriptions of two tenants' real official letters, "
                    "used to preview a renderer — not platform identity and not a "
                    "default (the resolver returns a neutral profile for an unknown "
                    "institution)"
                ),
                paths=("apps/admissions/src/lib/pdf/", "apps/admissions/src/pages/dev/"),
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "the tenant-context resolver / neutral Beanola fallback itself: the "
                    "code whose job is to ensure a legacy school is never the default"
                ),
                paths=(
                    "backend/apps/catalog/services.py",
                    "apps/admissions/src/lib/tenantSupport.ts",
                ),
            ),
            # NOTE: there is deliberately NO "seed/management commands are
            # canonical tenant data" rule here. The first draft of this category
            # had one, and it was wrong in an instructive way: the brand
            # allowlist below ALREADY has a "seeded tenant data" classification,
            # two seed commands are in it, and a blanket path rule for
            # `*/management/` was a second, more permissive register competing
            # with the first. It claimed three files the brand drift guard
            # correctly reports as violations. The rule was removed and the three
            # files were registered instead (docs/v2-evidence/12.5/README.md
            # §2.5). One category, one authority.
            #
            # The 19-path `registered-exception` rule that used to sit here was a
            # literal copy of the register, and its reason credited Property 28 to
            # beanola-launch-verification (it is beanola-production-readiness's;
            # launch-verification's own brand properties are 10 and 11). Task 12.5
            # pass 2 replaced it with `_brand_allowlist_rules()` above, which reads
            # the register instead of restating it.
        ),
    ),
    # ---- 6 ---------------------------------------------------------------- #
    ReviewCategory(
        n=6,
        id="ai_copy_imports",
        title="AI copy/imports",
        owning_task="7.4 removed admissions AI; 12.4 added the 18-case guard",
        requirement="R11.1, R11.9 · findings STU-06, STU-07",
        pattern=(
            r"\bai_service\b|\bai_cache\b|\bai_circuit_breaker\b|\bai_prompt_redactor\b"
            r"|AI_GATEWAY|AI_MODEL_|AI_HARDENING|AIUserScopedRateThrottle"
            r"|admin-summary|preview-summary"
            r"|AI-powered|AI-generated|AI summary|Powered by AI|artificial intelligence"
            r"|\btesseract\b|tesseract\.js"
        ),
        roots=(FRONT_PROD, BACK_APPS, TOOL_SCRIPTS),
        guards=("backend/tests/unit/test_no_admissions_generative_ai_guard.py",),
        rules=(
            Rule(
                bucket="canonical",
                reason=(
                    "the jobs-ops generative integration — the ONE remaining "
                    "generative surface on the platform, in its own boundary"
                ),
                paths=("backend/apps/jobs/",),
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "the namespaced JOBS_OPS_AI_* settings, read only by "
                    "apps/jobs/ai_service.py"
                ),
                paths=("backend/config/",),
                text=r"JOBS_OPS_AI",
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "server-side Tesseract OCR — deterministic assistance that never "
                    "has authority, deliberately kept by task 7.5"
                ),
                paths=(
                    "backend/apps/documents/grade_extraction.py",
                    "backend/apps/documents/tasks.py",
                ),
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "a DETECTOR for a retired thing, or a route catalogue's own record "
                    "that a route was deleted. 12.4 §8.4 and 7.5 both made this call "
                    "for these same patterns"
                ),
                paths=(
                    "scripts/inventory_admissions_v2.py",
                    "scripts/v1_surface_telemetry.py",
                    "scripts/authority_matrix_registry.py",
                ),
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "the jobs-ops outreach domain importing its own product's AI "
                    "service. `apps/outreach` is a jobs-ops domain app, so this is "
                    "inside the boundary, not across it — and 12.4's guard pins "
                    "`openai`'s importer set to apps/jobs/ai_service.py alone"
                ),
                paths=("backend/apps/outreach/", "backend/apps/automation/", "backend/apps/integrations/"),
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "another spec's launch-verification gate checking that the ONE live "
                    "AI key is configured. The env var name AI_GATEWAY_API_KEY is "
                    "deliberately unchanged (7.4 renamed the Django settings, not the "
                    "deployment keys), and the key is jobs-ops'"
                ),
                paths=("scripts/launch-verification/",),
            ),
        ),
    ),
    # ---- 7 ---------------------------------------------------------------- #
    ReviewCategory(
        n=7,
        id="direct_client_calls",
        title="direct client calls",
        owning_task="1.5 set the pattern; every phase since has shrunk the allowlist",
        requirement="R14.3, R14.5",
        pattern=(
            r"from\s*['\"](@/services/(client|httpClient|apiHelpers|retry|"
            r"authInterceptor|csrfManager)|\.\.?(/\.\.)*/(services/)?client)['\"]"
        ),
        roots=(FRONT_PROD,),
        guards=(
            "apps/admissions/tests/unit/architectureEnforcement.test.ts",
            "apps/admissions/eslint.config.js",
        ),
        rules=(
            Rule(
                bucket="canonical",
                reason=(
                    "a domain service module — the AUTHORIZED consumer of the raw "
                    "client. The rule's boundary is src/pages + src/components"
                ),
                paths=("apps/admissions/src/services/",),
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "the hook layer, which is where 12.1 and 9.4 deliberately put this "
                    "concern (useApplicationWorkspace / useReviewWorkspace). Outside "
                    "the enforced src/pages + src/components boundary"
                ),
                paths=("apps/admissions/src/hooks/",),
            ),
            Rule(
                bucket="registered-exception",
                reason=(
                    "LEGACY_EXCEPTIONS in architectureEnforcement.test.ts — the "
                    "shrink-only allowlist; half 5b audits it entry by entry"
                ),
                paths=(
                    "src/pages/dev/hooks/useDocumentGeneration.ts",
                    "src/pages/dev/hooks/usePaymentReceipt.ts",
                    "applicationWizard/hooks/useSmartAutoSave.ts",
                    "applicationWizard/hooks/useWizardController.ts",
                    "applicationWizard/hooks/useApplicationFileUploads.ts",
                    "applicationWizard/hooks/wizard/wizardControllerUtils.ts",
                    "applicationWizard/hooks/wizard/useWizardFileUploads.ts",
                    "applicationWizard/steps/PaymentStep.tsx",
                    "src/pages/student/PaymentCallback.tsx",
                ),
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "src/lib, src/stores and src/contexts infrastructure that IS "
                    "transport-adjacent (the client's own error classes, the CSRF "
                    "store, the app-boot auth-failure wiring); outside the "
                    "pages/components boundary the rule enforces"
                ),
                paths=(
                    "apps/admissions/src/lib/",
                    "apps/admissions/src/stores/",
                    "apps/admissions/src/contexts/",
                ),
            ),
        ),
    ),
    # ---- 8 ---------------------------------------------------------------- #
    ReviewCategory(
        n=8,
        id="window_confirm",
        title="`window.confirm`",
        owning_task="11.5 replaced the last one",
        requirement="R16.6",
        pattern=r"window\.confirm|\bconfirm\s*\(\s*['\"`]",
        roots=(FRONT_PROD, JOBS_SRC),
        guards=("apps/admissions/tests/unit/studentDashboardTaskFirst.test.tsx",),
        rules=(),
    ),
    # ---- 9 ---------------------------------------------------------------- #
    ReviewCategory(
        n=9,
        id="v1_document_callers",
        title="V1 document callers",
        owning_task="Phase 3 (R7) moved official documents to the backend pipeline; "
        "12.4 §3 removed @/lib/pdf from the production bundle",
        requirement="R7.1, R7.6, R18.1 · finding STU-05",
        pattern=(
            r"(from|import\(|import)\s*['\"]@/lib/pdf"
            r"|(generateApplicationSlip|generateAcceptanceLetter|"
            r"generatePaymentReceipt)\s*\("
        ),
        roots=(FRONT_PROD,),
        guards=("apps/admissions/tests/unit/documentFlowDriftGuard.test.ts",),
        rules=(
            Rule(
                bucket="canonical",
                reason=(
                    "the @/lib/pdf library's own internals and JSDoc usage examples — "
                    "it IS the generator implementation"
                ),
                paths=("apps/admissions/src/lib/pdf/",),
            ),
            Rule(
                bucket="registered-exception",
                reason=(
                    "PREVIEW_ALLOWLIST in documentFlowDriftGuard.test.ts — 5 reviewed "
                    "dev/draft-preview modules, each with a stated reason and a "
                    "staleness check; half 5b audits it"
                ),
                paths=(
                    "apps/admissions/src/pages/dev/DocumentPreview.tsx",
                    "apps/admissions/src/pages/dev/AcceptanceLetterPreview.tsx",
                    "apps/admissions/src/lib/slipService.ts",
                    "apps/admissions/src/pages/dev/hooks/useDocumentGeneration.ts",
                    "apps/admissions/src/pages/dev/hooks/usePaymentReceipt.ts",
                ),
            ),
        ),
    ),
    # ---- 10 --------------------------------------------------------------- #
    ReviewCategory(
        n=10,
        id="fallback_subject_ids",
        title="fallback subject IDs",
        owning_task="7.1 removed the selectable fallback-* ids",
        requirement="R9.2 · finding STU-11",
        pattern=r"fallback-[a-z]",
        roots=(FRONT_PROD, BACK_APPS),
        guards=(
            "apps/admissions/tests/unit/subjectMatcher.test.ts",
            "apps/admissions/tests/unit/educationCatalog.test.ts",
            "apps/admissions/tests/unit/wizard/subjectGradeContract.test.ts",
        ),
        rules=(
            Rule(
                bucket="canonical",
                reason=(
                    "the repair-only alias table task 7.1 kept on purpose: it maps a "
                    "retired slug from a PRE-7.1 draft onto a real server subject code, "
                    "which is strictly better for the student than discarding an "
                    "answer. Nothing in the UI can produce a new one — the selector's "
                    "options come from the server catalogue"
                ),
                paths=(
                    "applicationWizard/lib/educationCatalog.ts",
                    "apps/admissions/src/lib/canonicalSubjectId.ts",
                ),
            ),
        ),
    ),
    # ---- 11 --------------------------------------------------------------- #
    ReviewCategory(
        n=11,
        id="global_draft_clearing",
        title="global draft clearing",
        owning_task="6.3 consolidated it; 11.1 built the one scoped command",
        requirement="R10.7-R10.10, R16.5 · findings STU-04, STU-12",
        pattern=(
            r"clearAllDrafts|clearAllDraftData|forceCleanBrowserStorage"
            r"|localStorage\.clear\s*\(|sessionStorage\.clear\s*\("
        ),
        roots=(FRONT_PROD,),
        guards=("apps/admissions/tests/unit/studentDashboardTaskFirst.test.tsx",),
        rules=(
            Rule(
                bucket="canonical",
                reason=(
                    "the scoped command / the auth error boundary's own session reset "
                    "(a signed-out session's sessionStorage is not a draft store — "
                    "task 6.3 removed sessionStorage as a draft location under R7.6)"
                ),
                paths=(
                    "apps/admissions/src/lib/studentDraftCleanup.ts",
                    "apps/admissions/src/components/auth/AuthErrorBoundary.tsx",
                ),
            ),
            Rule(
                bucket="test-fixture",
                reason=(
                    "DraftManager.clearAllDrafts — MEASURED at zero production callers; "
                    "its only remaining consumer is a test, and that test is another "
                    "spec's numbered property (consolidation Property 16, concurrent-"
                    "call promise dedup). Task 6.3 recorded keeping it for exactly this "
                    "reason while deleting clearAllDraftData. Reading a source symbol "
                    "whose only consumer is a test as 'test fixture' is a stretch and "
                    "is stated as one — the alternative is deleting another spec's "
                    "numbered property, which 12.4 §7.3 warns against"
                ),
                paths=("apps/admissions/src/lib/draftManager.ts",),
                text=r"clearAllDrafts",
            ),
        ),
    ),
    # ---- 12 --------------------------------------------------------------- #
    ReviewCategory(
        n=12,
        id="stale_status_aliases",
        title="stale status aliases",
        owning_task="ALLOWED_TRANSITIONS in applications/services.py is the single "
        "source; payment reads normalize through paymentStatus.ts",
        requirement="R13.1 · canonical-truth-map (application statuses, payment states)",
        # A comparison against one of the LEGACY payment aliases
        # (paid / successful / force_approved / verified / pending_review) inside
        # the frontend. `successful` and `force_approved` ARE canonical
        # payments.status values, so a hit is not automatically a violation — the
        # question the classification answers is whether the read was normalized.
        pattern=(
            r"(===?|!==?)\s*['\"](paid|successful|force_approved|verified|pending_review)['\"]"
            r"|payment_status\s*(===?|!==?)\s*['\"]"
        ),
        roots=(FRONT_PROD,),
        guards=(
            "apps/admissions/tests/unit/paymentStatusLegacy.test.ts",
            "apps/admissions/src/types/__fixtures__/lifecycleStatusBackendMirror.ts",
            "backend/tests/unit/test_payment_phase_8_2.py",
        ),
        rules=(
            Rule(
                bucket="canonical",
                reason="paymentStatus.ts — the normalizer itself, and the one place the aliases are named",
                paths=("apps/admissions/src/lib/paymentStatus.ts",),
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "the compared value was produced by a normalizer on the same line "
                    "(normalizePaymentStatus / normalizePaymentStatusValue / a "
                    "`normalized*` binding), so the branch is over the canonical "
                    "vocabulary, not a raw provider string"
                ),
                text=r"normaliz|Normaliz",
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "not a payment status: `verified` here is a DOCUMENT verification "
                    "state or an InstitutionDomain status, each canonical in its own "
                    "domain"
                ),
                text=r"verification_status|requirement\.state|domain\.status|tone ===|doc\.",
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "a `typeof … === 'string'` TYPE guard, not a status branch. The "
                    "recorded pattern catches it because `payment_status === '` is "
                    "genuinely present; it is shown rather than filtered"
                ),
                text=r"typeof\s+[A-Za-z_$.\[\]'\"]+\s*===\s*'string'|'payment_status' in ",
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "the compared value was produced by a normalizer within 2 lines "
                    "(normalizePaymentStatus / normalizePaymentStatusValue), so the "
                    "branch is over the canonical vocabulary"
                ),
                text=r"normalizePaymentStatus",
                window=3,
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "`successful` is the CANONICAL payments.status value "
                    "(CanonicalPaymentServiceStatus), not a legacy alias. The legacy "
                    "aliases paymentStatus.ts normalizes away are `paid`, `verified`, "
                    "`force_approved` and `pending` — a branch on `successful` / "
                    "`failed` / `deferred` / `expired` is a branch on the current "
                    "vocabulary"
                ),
                text=r"===?\s*'successful'|!==?\s*'successful'",
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "the admin's PENDING DECISION being sent as a write payload "
                    "('verified' | 'rejected'), which is the backend-write-payload case "
                    "steering explicitly permits — not a read of a payment's status"
                ),
                text=r"pendingPaymentStatus",
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "not a payment status: a DOCUMENT verification state or an "
                    "InstitutionDomain status, each canonical in its own domain"
                ),
                text=r"verification_status|requirement\.state|domain\.status|docStatus"
                r"|tone ===|doc\.|value === 'verified' \|\| value === 'uploaded'",
            ),
            Rule(
                bucket="canonical",
                reason=(
                    "a provider-callback status read off the Lenco redirect/verify "
                    "payload — the write-payload case, and PaymentCallback.tsx is where "
                    "the provider's own vocabulary legitimately arrives"
                ),
                paths=("apps/admissions/src/pages/student/PaymentCallback.tsx",),
            ),
            Rule(
                bucket="dev-preview",
                reason="dev-only preview hook",
                paths=("apps/admissions/src/pages/dev/",),
            ),
        ),
    ),
    # ---- 13 --------------------------------------------------------------- #
    ReviewCategory(
        n=13,
        id="surfaced_by_the_twelve",
        title="anything the 12 above surface that belongs to a registered exception",
        owning_task="12.2 built the register; 12.3 widened it to columns; "
        "12.4 added the shrink-only decline register",
        requirement="R2.6, R14.7, R15.6-R15.9",
        # The register-bearing surfaces themselves: every place in the product
        # that claims an exemption. A match here must resolve to a REAL register
        # entry, which is half 5b's job.
        pattern=(
            r"LEGACY_EXCEPTIONS|DECLINED_REMOVALS|_ALLOWED_PREDICATES|PREVIEW_ALLOWLIST"
            r"|COMPATIBILITY_SURFACES|COMPATIBILITY_OWNER|REMOVAL_CONDITION"
            r"|Legacy_Exception|legacy[- ]exception"
        ),
        roots=(FRONT_PROD, FRONT_TESTS, BACK_APPS, BACK_TESTS, TOOL_SCRIPTS),
        guards=(
            "backend/tests/unit/test_compatibility_surfaces_12_2.py",
            "backend/tests/unit/test_legacy_column_contraction_12_3.py",
            "backend/tests/unit/test_brand_drift_guard.py",
        ),
        rules=(
            Rule(
                bucket="canonical",
                reason="a register definition, or the guard that audits it",
                paths=(
                    "backend/apps/common/compatibility_register.py",
                    "backend/apps/catalog/legacy_write_telemetry.py",
                    "backend/apps/common/legacy_columns.py",
                    "scripts/module-size-report.ts",
                    "scripts/v1_surface_telemetry.py",
                ),
            ),
            Rule(
                bucket="registered-exception",
                reason=(
                    "a task-12.1 re-export shim carrying its own COMPATIBILITY_OWNER + "
                    "REMOVAL_CONDITION, evaluated on every run by 12.2 §10.3's "
                    "shrink-only budget test. Task 12.5 extended that test's SHIMS "
                    "register from 2 to all 6 shims — four had a documented removal "
                    "condition nothing evaluated"
                ),
                paths=(
                    "backend/apps/catalog/views.py",
                    "backend/apps/catalog/admin_views.py",
                    "backend/apps/accounts/admin_views.py",
                    "backend/apps/accounts/batch_views.py",
                    "backend/apps/documents/views.py",
                ),
            ),
        ),
    ),
)


def _review_bucket(cat: ReviewCategory, rel: str, lineno: int, line: str) -> tuple[str, str]:
    """Classify one hit. Returns ``(bucket, reason)``.

    Order is deliberate and is the argument of this whole half:

    1. **immutable evidence** first (R2.7) — a match under ``docs/v2-evidence/``
       is a record of what someone measured on a date and is never a violation,
       so nothing later can reclassify it into one.
    2. **comment** second — *a comment is not a caller.* 12.2's first run failed
       on prose inside a JSDoc block recording a retirement, and 11.4 §6 records
       the same rule for the UUID scan. Placed before the per-category rules so a
       category does not have to re-state it.
    3. **test fixture** third.
    4. then the category's own ordered rules (canonical / registered-exception /
       dev-preview).
    5. anything left is **unregistered**, which is the finding.
    """
    if any(rel.startswith(p) for p in _IMMUTABLE_PREFIXES):
        return "immutable-evidence", "docs/v2-evidence, docs/audits or an archived spec (R2.7)"
    try:
        if lineno in _comment_line_numbers(REPO_ROOT / rel):
            return "comment", "prose — a comment is not a caller (12.2 §1.2, 11.4 §6)"
    except OSError:
        pass
    if (
        any(rel.startswith(p) for p in _TEST_PREFIXES)
        or rel.endswith(_TEST_SUFFIXES)
        or any(s in rel for s in _TEST_SUBSTRINGS)
    ):
        return "test-fixture", "a test, fixture or spec pin"
    for rule in cat.rules:
        around = _surrounding_lines(rel, lineno, rule.window) if rule.window else ""
        if rule.matches(rel, line, around):
            return rule.bucket, rule.reason
    return "unregistered", "no rule claims this hit"


_FILE_LINES_CACHE: dict[str, list[str]] = {}


def _surrounding_lines(rel: str, lineno: int, count: int) -> str:
    """The ``count`` source lines either side of ``lineno`` (1-indexed)."""
    if rel not in _FILE_LINES_CACHE:
        try:
            _FILE_LINES_CACHE[rel] = (
                (REPO_ROOT / rel).read_text(encoding="utf-8", errors="replace").splitlines()
            )
        except OSError:
            _FILE_LINES_CACHE[rel] = []
    lines = _FILE_LINES_CACHE[rel]
    start = max(0, lineno - 1 - count)
    return "\n".join(lines[start : lineno + count])


def run_review() -> dict[str, Any]:
    """Half 5 — the reviewed search manifest task 12.5's Required_Evidence asks for."""
    categories: list[dict[str, Any]] = []
    for cat in REVIEW_CATEGORIES:
        cat.hits = []
        for rel, lineno, line in _grep(cat.pattern, cat.roots):
            bucket, reason = _review_bucket(cat, rel, int(lineno), line)
            cat.hits.append(
                {
                    "file": rel,
                    "line": lineno,
                    "bucket": bucket,
                    "reason": reason,
                    "text": line.strip()[:200],
                }
            )
        missing_guards = [g for g in cat.guards if not (REPO_ROOT / g).exists()]
        categories.append(
            {
                "n": cat.n,
                "id": cat.id,
                "title": cat.title,
                "owning_task": cat.owning_task,
                "requirement": cat.requirement,
                "pattern": cat.pattern,
                "roots": [str(r.relative_to(REPO_ROOT)) for r in cat.roots],
                "guards": list(cat.guards),
                # 12.4 §16 #3: a guard named in a comment is not a guard.
                "missing_guards": missing_guards,
                "note": cat.note,
                "total_hits": len(cat.hits),
                "by_bucket": {
                    b: sum(1 for h in cat.hits if h["bucket"] == b)
                    for b in REVIEW_BUCKETS
                    if any(h["bucket"] == b for h in cat.hits)
                },
                "unregistered": len(cat.unregistered),
                "passed": cat.ok and not missing_guards,
                "hits": cat.hits,
            }
        )

    registers = run_register_audit()
    unregistered_total = sum(c["unregistered"] for c in categories)
    guard_gaps = sorted({g for c in categories for g in c["missing_guards"]})
    return {
        "half": "review",
        "passed": unregistered_total == 0 and not guard_gaps and registers["passed"],
        "categories_declared": len(categories),
        "total_hits": sum(c["total_hits"] for c in categories),
        "unregistered_total": unregistered_total,
        "missing_guards": guard_gaps,
        "categories": categories,
        "registers": registers,
    }


# --------------------------------------------------------------------------- #
# Half 5b — the register audit
# --------------------------------------------------------------------------- #
#
# Task 12.5's second clause allows a remaining match when it is "a registered
# Legacy_Exception with owner/removal date". That makes the REGISTERS part of the
# audit: an entry with no owner, no date, no named measurement, or no mechanism
# that fails when the entry stops being a violation is an exemption, not an
# exception. 12.4 §4.3's DECLINED_REMOVALS is the pattern — exact keys, and a
# STALE DECLINE fails the scan — so this audits every register against that
# shape rather than inventing a fifth register.

#: The registers this task audits, with the four properties an honest register
#: has. ``staleness`` names the mechanism that fails when an entry is no longer a
#: violation; ``None`` means there is none, which is a finding.
_REGISTERS: tuple[dict[str, Any], ...] = (
    {
        "id": "compatibility_register.COMPATIBILITY_SURFACES",
        "file": "backend/apps/common/compatibility_register.py",
        "owner_field": "owner",
        "date_field": "end_date",
        "staleness": "backend/tests/unit/test_compatibility_surfaces_12_2.py",
        "shrink_only": True,
    },
    {
        # A *declined removal* is a decision NOT to delete, so its whole
        # population is permanent by design and outside the Legacy_Exception
        # population: a removal date would assert the opposite of the entry
        # (L9-L11 README §4.2). Reported as `date n/a`, never as a gap.
        "id": "module-size-report.DECLINED_REMOVALS",
        "file": "scripts/module-size-report.ts",
        "owner_field": "owner",
        "date_field": None,
        "population": "permanent",
        "staleness": "scripts/module-size-report.ts",
        "shrink_only": True,
    },
    {
        # Owner + removal date added by task 13.6's remediation item L10
        # (GATE-13.6-01): the entries became `{path, owner, removeBy}` and a third
        # test fails when an entry has no owner, no ISO date, or an expired window.
        # docs/v2-evidence/13.6/remediation/L9-L11/README.md §4.
        "id": "architectureEnforcement.LEGACY_EXCEPTIONS",
        "file": "apps/admissions/tests/unit/architectureEnforcement.test.ts",
        "owner_field": "owner",
        "date_field": "removeBy",
        "staleness": "apps/admissions/tests/unit/architectureEnforcement.test.ts",
        "shrink_only": True,
    },
    {
        # Staleness added by task 12.5 —
        # ``test_allowed_predicates_has_no_stale_entries_and_can_only_shrink``.
        # Before that this register had the one property an exemption register
        # must not have: nothing failed when an entry stopped matching.
        "id": "canonical_tenant_drift_guard._ALLOWED_PREDICATES",
        "file": "backend/tests/unit/test_canonical_tenant_drift_guard.py",
        "owner_field": "owner",
        "date_field": "remove_by",
        "staleness": "backend/tests/unit/test_canonical_tenant_drift_guard.py",
        "shrink_only": True,
    },
    {
        # Owner + removal date added by task 13.6's remediation item L10
        # (GATE-13.6-01), on the same 12.2 window as the register above.
        "id": "documentFlowDriftGuard.PREVIEW_ALLOWLIST",
        "file": "apps/admissions/tests/unit/documentFlowDriftGuard.test.ts",
        "owner_field": "owner",
        "date_field": "removeBy",
        "staleness": "apps/admissions/tests/unit/documentFlowDriftGuard.test.ts",
        "shrink_only": True,
    },
    # -- the two the 13-category sweep surfaced, now made accountable by M10.
    #    Their owner names preserve the responsibility already recorded by the
    #    active launch spec and canonical tenancy boundary.
    {
        "id": "legacy-brand-allowlist.allowlist",
        "file": "docs/legacy-brand-allowlist.json",
        "owner_field": "owner",
        "date_field": "removeBy",
        "staleness": "backend/tests/unit/test_brand_drift_guard.py",
        "shrink_only": True,
    },
    {
        # Removal date added by task 13.6's remediation item L10 (GATE-13.6-01).
        # The owner was already per-entry (each shim module carries its own
        # COMPATIBILITY_OWNER marker, asserted by the guard); what was missing was
        # a date. The guard now reads 12.2's announced window out of
        # COMPATIBILITY_SURFACES and fails once it closes, so the six shims cannot
        # outlive the window without somebody renewing it on purpose.
        "id": "test_compatibility_surfaces_12_2.SHIMS",
        "file": "backend/tests/unit/test_compatibility_surfaces_12_2.py",
        "owner_field": "COMPATIBILITY_OWNER",
        "date_field": "SHIM_REMOVAL_DATE_SOURCE",
        "staleness": "backend/tests/unit/test_compatibility_surfaces_12_2.py",
        "shrink_only": True,
    },
)


#: ``symbol -> (declaration anchor, block terminator, per-entry pattern)``.
#:
#: The anchor is the **declaration**, not the bare symbol name. Anchoring on the
#: name alone reads the first mention — which for ``PREVIEW_ALLOWLIST`` is a
#: JSDoc line 72 lines above the array, so the block then terminated on an
#: unrelated ``] as const`` and the count came out **0**. A register audit that
#: silently reports zero entries is the worst possible failure mode for this
#: half, because "no entries" reads as "nothing exempted".
_REGISTER_SHAPES: dict[str, tuple[str, str, str]] = {
    "COMPATIBILITY_SURFACES": (
        "COMPATIBILITY_SURFACES: dict[str, CompatibilitySurface] = {",
        "\n}\n",
        r"^\s*CompatibilitySurface\($",
    ),
    "DECLINED_REMOVALS": (
        "const DECLINED_REMOVALS",
        "\n}\n",
        r"^\s*owner:\s*'",
    ),
    # Task 13.6 item L10 turned the bare `string[]` into `{path, owner, removeBy}`
    # entries, so the anchor and the per-entry pattern moved with it. The count
    # must still read 9 — the register is shrink-only, and dating it is not a
    # licence to grow it.
    "LEGACY_EXCEPTIONS": (
        "const LEGACY_EXCEPTIONS: readonly LegacyException[] = [",
        "\n]\n",
        r"^\s*path:",
    ),
    "_ALLOWED_PREDICATES": (
        "_ALLOWED_PREDICATES: set[LegacyPredicateException] = {",
        "\n}\n",
        r"^\s*_legacy_exception\(",
    ),
    "PREVIEW_ALLOWLIST": (
        "const PREVIEW_ALLOWLIST: readonly AllowlistEntry[] = [",
        "\n] as const",
        r"^\s*path:",
    ),
    "allowlist": (
        '"allowlist": [',
        "\n  ]",
        r'^\s*"path":',
    ),
    "SHIMS": (
        "SHIMS = {",
        "\n}\n",
        r'^\s*"apps\.',
    ),
}


def _count_register_entries(rel: str, symbol: str) -> int:
    """Entry count for a register, read from its own declaration.

    Returns ``-1`` when the file is missing and ``-2`` when the declaration
    anchor is not found — both distinguishable from a real zero, deliberately.
    """
    path = REPO_ROOT / rel
    if not path.exists():
        return -1
    shape = _REGISTER_SHAPES.get(symbol)
    if shape is None:
        return -2
    anchor, terminator, entry_re = shape
    text = path.read_text(encoding="utf-8", errors="replace")
    if anchor not in text:
        return -2
    block = text.split(anchor, 1)[1].split(terminator, 1)[0]
    return len(re.findall(entry_re, block, re.M))


def run_register_audit() -> dict[str, Any]:
    """Audit every exemption register for owner / date / measurement / staleness."""
    findings: list[dict[str, Any]] = []
    for reg in _REGISTERS:
        rel = reg["file"]
        symbol = reg["id"].split(".", 1)[1]
        exists = (REPO_ROOT / rel).exists()
        staleness = reg["staleness"]
        findings.append(
            {
                "register": reg["id"],
                "file": rel,
                "file_exists": exists,
                "entries": _count_register_entries(rel, symbol),
                "per_entry_owner": bool(reg["owner_field"]),
                "per_entry_removal_date": bool(reg["date_field"]),
                "shrink_only": reg["shrink_only"],
                "staleness_mechanism": staleness,
                # 12.4 §16 #3 again: the named mechanism must be a file that exists.
                "staleness_mechanism_exists": bool(
                    staleness and (REPO_ROOT / staleness).exists()
                ),
            }
        )

    # A register the review DEPENDS ON (categories 7, 9, 13 route hits into it)
    # must at minimum exist and have a staleness mechanism that exists. Missing
    # per-entry owner/date is reported as a gap rather than failing the half:
    # three of these five registers predate task 12.2's owner/date convention and
    # belong to other specs, so failing on them would make this half unrunnable
    # rather than informative. §5b of the README states which is which.
    broken = [
        f["register"]
        for f in findings
        if not f["file_exists"]
        or f["entries"] < 0
        or (f["staleness_mechanism"] and not f["staleness_mechanism_exists"])
    ]
    gaps = [
        f["register"]
        for f in findings
        if not f["staleness_mechanism"] or not f["per_entry_owner"]
    ]
    return {
        "passed": not broken,
        "broken": broken,
        "gaps_reported_not_failed": gaps,
        "registers": findings,
    }


def render_review(rv: dict[str, Any]) -> str:
    lines: list[str] = []
    w = lines.append
    w("")
    w("=" * 78)
    w("HALF 5: CANONICAL-PATH REVIEW MANIFEST (task 12.5) " + "-" * 27)
    w("R1, R2, R3, R7, R11, R14-R16 · the bullet's 13 categories, every hit classified")
    w("")
    w("Buckets: canonical | test-fixture | immutable-evidence | registered-exception")
    w("         + comment and dev-preview (stated additions — see the module comment)")
    w("The verdict of this half is that the 'unregistered' bucket is EMPTY.")
    w("")
    w(f"   {'#':>2} {'category':<34} {'hits':>5} {'unreg':>6}  buckets")
    for c in rv["categories"]:
        buckets = ", ".join(f"{k}={v}" for k, v in c["by_bucket"].items() if k != "unregistered")
        w(f"   {c['n']:>2} {c['id']:<34} {c['total_hits']:>5} {c['unregistered']:>6}  {buckets or '-'}")
    w("")
    w(f"   categories declared : {rv['categories_declared']}")
    w(f"   total hits          : {rv['total_hits']}")
    w(f"   UNREGISTERED        : {rv['unregistered_total']}")
    w(f"   guards named but missing : {rv['missing_guards'] or 'none'}")
    w(f"   HALF 5 PASS={rv['passed']}")
    w("")

    for c in rv["categories"]:
        w("-" * 78)
        w(f"[{c['n']}] {c['id']} — {c['title']}")
        w(f"     owning task : {c['owning_task']}")
        w(f"     requirement : {c['requirement']}")
        w(f"     pattern     : {c['pattern']}")
        w(f"     roots       : {', '.join(c['roots'])}")
        w(f"     guards      : {', '.join(c['guards']) or '(none declared)'}")
        if c["note"]:
            w(f"     note        : {c['note']}")
        w(f"     hits        : {c['total_hits']}   unregistered: {c['unregistered']}")
        for h in c["hits"]:
            w(f"       {h['bucket']:<21} {h['file']}:{h['line']}")
            w(f"       {'':<21}   {h['text']}")
            w(f"       {'':<21}   why: {h['reason']}")
        if not c["hits"]:
            w("       (no matches)")
        w("")

    reg = rv["registers"]
    w("=" * 78)
    w("HALF 5b: THE REGISTER AUDIT " + "-" * 50)
    w("An entry with no owner, no date, no named measurement, or no mechanism that")
    w("fails when it STOPS being a violation is an exemption, not an exception.")
    w("")
    w(f"   {'register':<48} {'n':>3} {'own':>4} {'date':>5} {'shrink':>7} {'stale-chk':>10}")
    for f in reg["registers"]:
        w(
            f"   {f['register']:<48} {f['entries']:>3} "
            f"{('yes' if f['per_entry_owner'] else 'NO'):>4} "
            f"{('yes' if f['per_entry_removal_date'] else 'NO'):>5} "
            f"{('yes' if f['shrink_only'] else 'NO'):>7} "
            f"{('yes' if f['staleness_mechanism_exists'] else 'NONE'):>10}"
        )
    w("")
    for f in reg["registers"]:
        w(f"   {f['register']}")
        w(f"     file      : {f['file']}  (exists={f['file_exists']})")
        w(f"     staleness : {f['staleness_mechanism'] or 'NONE — reported as a gap'}")
    w("")
    w(f"   broken (fails half 5)      : {reg['broken'] or 'none'}")
    w(f"   gaps (reported, not failed): {reg['gaps_reported_not_failed'] or 'none'}")
    w(f"   HALF 5b PASS={reg['passed']}")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", action="store_true", help="source telemetry only")
    ap.add_argument("--routes", action="store_true", help="route telemetry only")
    ap.add_argument("--headers", action="store_true", help="end-date check only")
    ap.add_argument(
        "--columns",
        action="store_true",
        help="legacy-column telemetry only (half 4, task 12.3)",
    )
    ap.add_argument(
        "--review",
        action="store_true",
        help="canonical-path review manifest only (half 5 + 5b, task 12.5)",
    )
    ap.add_argument("--json", metavar="PATH", help="also write the raw report as JSON")
    args = ap.parse_args()

    all_halves = not (
        args.source or args.routes or args.headers or args.columns or args.review
    )
    report: dict[str, Any] = {}
    report["source"] = (
        run_source(SURFACES) if (all_halves or args.source) else {"half": "source", "skipped": True, "passed": True, "surfaces": [], "failures": []}
    )
    report["routes"] = run_routes() if (all_halves or args.routes) else {"half": "routes", "skipped": True, "passed": True}
    report["headers"] = run_headers() if (all_halves or args.headers) else {"half": "headers", "skipped": True, "passed": True, "findings": [], "registered_surfaces": [], "register_exists": False, "surfaces_without_announced_end_date": []}
    # ``passed`` remains the V1-SURFACE verdict of the three halves task 12.2
    # shipped, so re-running this tool bare still reproduces 12.2's recorded
    # ``OVERALL PASS = True``. Half 4 asks a different question — "may the legacy
    # columns be contracted yet" — and on 2026-08-11 the honest answer is no.
    # Folding a legitimately-failing gate into 12.2's verdict would turn a real
    # finding into a broken tool, so it carries its own verdict instead.
    report["passed"] = all(
        report[h].get("passed", False) for h in ("source", "routes", "headers")
    )
    report["columns"] = (
        run_columns() if (all_halves or args.columns) else {"half": "columns", "skipped": True, "passed": True, "columns": [], "gates": {}}
    )
    # Half 5 (task 12.5) carries its own verdict for the same reason half 4 does:
    # it asks a different question from 12.2's three halves, and folding it into
    # ``report["passed"]`` would change what a bare re-run of 12.2's recorded
    # command means.
    report["review"] = (
        run_review()
        if (all_halves or args.review)
        else {"half": "review", "skipped": True, "passed": True}
    )

    print(render(report))
    if not report["review"].get("skipped"):
        print(render_review(report["review"]))
    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2), encoding="utf-8")

    # Exit code: the V1 halves always count. Halves 4 and 5 count only when the
    # caller asked for them, so `--columns` / `--review` are usable as gates in
    # their own right without changing what a bare run means.
    ok = report["passed"]
    if args.columns and not report["columns"].get("passed", True):
        ok = False
    if args.review and not report["review"].get("passed", True):
        ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
