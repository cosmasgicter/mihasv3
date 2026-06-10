"""Drift guard — no NEW runtime logic matches on the legacy tenant strings.

The Beanola multi-tenant conversion makes the canonical IDs
(``canonical_programs.id`` / ``programs.id`` / ``institutions.id`` /
``intakes.id``) the **sole** sources of truth for routing, scoping, payment
tagging, and document generation (R1.2). The pre-canonical
``applications.program`` / ``applications.intake`` / ``applications.institution``
columns are **display snapshots only** — read-only mirrors that must never drive
new business logic (R1.3).

This guard is the static-analysis enforcement of that rule. It walks every
Python module under ``backend/apps/`` and uses the AST to find ORM *query
predicates* — ``.filter(...)`` / ``.exclude(...)`` / ``.get(...)`` calls and
``Q(...)`` constructors — that key on one of the legacy string fields
(``program`` / ``intake`` / ``institution``) either bare or via a *string*
lookup (``__icontains``, ``__iexact``, …).

It deliberately does NOT flag:

* FK predicates on the catalog models themselves (e.g.
  ``ProgramFee.objects.filter(program=program_obj)`` or
  ``Program.objects.filter(institution_id=...)``) — on those models
  ``program`` / ``institution`` / ``intake`` are real foreign keys, not the
  Application legacy strings. These are skipped by model-root detection.
* Relation traversals such as ``program__institution_id__in`` or
  ``institution__is_active`` — the lookup suffix is not a string lookup, so the
  predicate is targeting a canonical relation, not a legacy display string.
* Writes — ``.create(institution=...)`` / constructor kwargs / log kwargs /
  notification kwargs. Writing the display snapshot is allowed; only *matching*
  on it is forbidden.

Every legitimate remaining legacy-string predicate lives in an explicitly
labelled legacy-fallback / pre-canonical branch and is allowlisted below by a
stable ``(relative_path, field, value_expr)`` signature. Any UNLISTED new
occurrence fails the test, pointing the author at the canonical IDs instead.

Uses pure file I/O + ``ast`` — no Django DB fixture, no models loaded.

Validates: Requirements R1.2, R1.3, R1.6
"""

from __future__ import annotations

import ast
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# backend/tests/unit/test_canonical_tenant_drift_guard.py
#   .parents[2] -> backend/
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_APPS_ROOT = _BACKEND_ROOT / "apps"

_SKIP_DIR_NAMES = {"__pycache__", "migrations"}


# ---------------------------------------------------------------------------
# What counts as a legacy-string predicate
# ---------------------------------------------------------------------------

# The three pre-canonical Application display-snapshot columns.
_LEGACY_FIELDS = {"program", "intake", "institution"}

# Django string lookups. A ``program__<suffix>`` predicate is only a legacy
# *string* match when the suffix is one of these; anything else (e.g.
# ``program__institution_id``) is a relation traversal onto canonical IDs.
_STRING_LOOKUPS = {
    "icontains",
    "iexact",
    "exact",
    "contains",
    "startswith",
    "istartswith",
    "endswith",
    "iendswith",
    "regex",
    "iregex",
}

# ORM query-predicate call names. Writes (``create``/``update``/``bulk_*``) are
# intentionally absent — persisting the snapshot string is allowed.
_PREDICATE_METHODS = {"filter", "exclude", "get"}

# Catalog / other model classes on which ``program`` / ``intake`` /
# ``institution`` are genuine foreign keys (NOT the Application legacy strings).
# A method-call predicate whose receiver chain roots at one of these is skipped.
_NON_APPLICATION_MODEL_ROOTS = {
    "Program",
    "ProgramFee",
    "ProgramIntake",
    "Institution",
    "CanonicalProgram",
    "Intake",
    "InstitutionDomain",
    "InstitutionAsset",
    "InstitutionDocumentTemplate",
    "InstitutionRequiredDocument",
    "UserInstitutionMembership",
    "AccessGrant",
    "Subject",
    "CourseRequirement",
    "AcademicCalendarEvent",
}


# ---------------------------------------------------------------------------
# Allowlist — the explicit, labelled legacy-fallback / pre-canonical branches.
#
# Each entry is ``(relative_path, "field=value_expr")``. These are the ONLY
# places allowed to match on the Application legacy strings; every one is a
# documented legacy-fallback or pre-canonical-display branch. A new predicate
# with any other signature fails the guard.
# ---------------------------------------------------------------------------

_ALLOWED_PREDICATES: set[tuple[str, str]] = {
    # duplicate_checker.py — canonical-first keying with an explicit legacy
    # string fallback only when the canonical id is absent (R8.5).
    ("apps/applications/duplicate_checker.py", "program=program"),
    ("apps/applications/duplicate_checker.py", "intake=intake"),
    # waitlist_manager.py — waitlist position/promotion keyed on the
    # pre-canonical program+intake display strings (pre-Beanola business logic).
    ("apps/applications/waitlist_manager.py", "program=program"),
    ("apps/applications/waitlist_manager.py", "intake=intake"),
    ("apps/applications/waitlist_manager.py", "program=application.program"),
    ("apps/applications/waitlist_manager.py", "intake=application.intake"),
    # intake_enforcer.py — capacity counts keyed on the legacy intake/program
    # name strings (pre-canonical enrollment counting).
    ("apps/applications/intake_enforcer.py", "intake=intake_name"),
    ("apps/applications/intake_enforcer.py", "program=program_name"),
    # tasks/waitlist.py — waitlist_cascade_task carries waitlisted rows to the
    # next intake using the pre-canonical program/intake display strings
    # (existing pre-Beanola cascade business logic; the Application.create()
    # below writes the snapshot and is correctly NOT a match).
    ("apps/applications/tasks/waitlist.py", "intake=intake.name"),
    ("apps/applications/tasks/waitlist.py", "program=app.program"),
    ("apps/applications/tasks/waitlist.py", "intake=next_intake.name"),
    # analytics/admissions_analytics.py — admin display-string contains filter
    # over the pre-canonical institution/program snapshots (reporting only).
    # Signatures are normalised by ast.unparse (single quotes).
    ("apps/analytics/admissions_analytics.py", "institution__icontains=filters['institution']"),
    ("apps/analytics/admissions_analytics.py", "program__icontains=filters['program']"),
}


# ---------------------------------------------------------------------------
# AST helpers
# ---------------------------------------------------------------------------


def _iter_py_files(root: Path):
    for path in root.rglob("*.py"):
        if any(part in _SKIP_DIR_NAMES for part in path.parts):
            continue
        yield path.resolve()


def _legacy_kwarg(name: str | None) -> bool:
    """True when *name* targets a legacy string field (bare or string lookup)."""
    if not name:
        return False
    parts = name.split("__")
    if parts[0] not in _LEGACY_FIELDS:
        return False
    if len(parts) == 1:
        return True
    if len(parts) == 2 and parts[1] in _STRING_LOOKUPS:
        return True
    return False


def _root_name(node: ast.AST) -> str | None:
    """Walk a receiver chain (calls/attributes/subscripts) to its root Name."""
    cur = node
    while True:
        if isinstance(cur, ast.Call):
            cur = cur.func
        elif isinstance(cur, ast.Attribute):
            cur = cur.value
        elif isinstance(cur, ast.Subscript):
            cur = cur.value
        else:
            break
    return cur.id if isinstance(cur, ast.Name) else None


def _unparse(value: ast.AST) -> str:
    try:
        return ast.unparse(value)
    except Exception:  # pragma: no cover - defensive
        return "<unparseable>"


def _is_query_predicate_call(call: ast.Call) -> bool:
    """True for ``X.filter/exclude/get(...)`` or ``Q(...)`` calls."""
    func = call.func
    if isinstance(func, ast.Attribute) and func.attr in _PREDICATE_METHODS:
        return True
    if isinstance(func, ast.Name) and func.id == "Q":
        return True
    return False


def _call_is_skippable_fk_predicate(call: ast.Call) -> bool:
    """Skip method-call predicates rooted at a known non-Application model."""
    func = call.func
    if isinstance(func, ast.Attribute):
        root = _root_name(func.value)
        return root in _NON_APPLICATION_MODEL_ROOTS
    return False  # Q(...) has no receiver — never skipped here.


def _scan_file(path: Path) -> list[tuple[str, int, str]]:
    """Return ``(signature, line_no, source_line)`` legacy-string predicate hits."""
    rel = str(path.relative_to(_BACKEND_ROOT))
    source = path.read_text(encoding="utf-8", errors="replace")
    try:
        tree = ast.parse(source, filename=rel)
    except SyntaxError:  # pragma: no cover - defensive
        return []
    src_lines = source.splitlines()

    hits: list[tuple[str, int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not _is_query_predicate_call(node):
            continue
        if _call_is_skippable_fk_predicate(node):
            continue
        for kw in node.keywords:
            if kw.arg is None:  # **kwargs splat
                continue
            if not _legacy_kwarg(kw.arg):
                continue
            signature = f"{kw.arg}={_unparse(kw.value)}"
            line_no = getattr(kw.value, "lineno", node.lineno)
            src = src_lines[line_no - 1].strip() if 0 < line_no <= len(src_lines) else ""
            hits.append((signature, line_no, src))
    return hits


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------


def test_no_new_runtime_logic_matches_legacy_tenant_strings():
    """Canonical IDs are the sole routing/scoping authority (R1.2, R1.3).

    Fails when any module under ``backend/apps/`` adds a NEW ORM predicate that
    matches on the ``applications.program/intake/institution`` legacy strings
    outside the explicitly allowlisted legacy-fallback branches.

    Validates: Requirements R1.2, R1.3, R1.6
    """
    assert _APPS_ROOT.is_dir(), f"expected backend/apps to exist at {_APPS_ROOT}"

    offenders: dict[str, list[tuple[str, int, str]]] = {}
    for path in _iter_py_files(_APPS_ROOT):
        rel = str(path.relative_to(_BACKEND_ROOT))
        for signature, line_no, src in _scan_file(path):
            if (rel, signature) in _ALLOWED_PREDICATES:
                continue
            offenders.setdefault(rel, []).append((signature, line_no, src))

    if offenders:
        lines = [
            "Canonical IDs (canonical_programs.id / programs.id / "
            "institutions.id / intakes.id) are the sole sources of truth for "
            "routing, scoping, payment tagging, and document generation "
            "(R1.2, R1.3). The following modules add NEW runtime logic that "
            "matches on the legacy applications.program/intake/institution "
            "display strings. Key on the canonical IDs instead, or — if this is "
            "a deliberate, labelled legacy-fallback branch — add its "
            "(path, 'field=value') signature to _ALLOWED_PREDICATES with a "
            "comment.",
            "",
        ]
        for rel in sorted(offenders):
            lines.append(f"  {rel}")
            for signature, line_no, src in offenders[rel]:
                lines.append(f"    line {line_no} [{signature}]: {src}")
            lines.append("")
        raise AssertionError("\n".join(lines))
